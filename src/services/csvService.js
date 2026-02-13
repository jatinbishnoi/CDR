const fs = require('fs');
const csv = require('csv-parser');
const { promisePool } = require('../config/database');

class CSVService {
    // Process and store CDR data from CSV
    async processCDRFile(filePath) {
        const results = [];
        const errors = [];
        
        return new Promise((resolve, reject) => {
            fs.createReadStream(filePath)
                .pipe(csv({
                    mapValues: ({ header, index, value }) => {
                        // Trim whitespace from all values
                        return value ? value.toString().trim() : '';
                    }
                }))
                .on('headers', (headers) => {
                    console.log('CSV Headers:', headers);
                })
                .on('data', (data) => {
                    try {
                        const processedData = this.mapCSVToCDR(data);
                        if (processedData) {
                            results.push(processedData);
                        } else {
                            errors.push({ data, error: 'Invalid record' });
                        }
                    } catch (err) {
                        errors.push({ data, error: err.message });
                    }
                })
                .on('end', async () => {
                    try {
                        if (results.length === 0) {
                            return reject({
                                success: false,
                                error: 'No valid records found in CSV file',
                                errors: errors
                            });
                        }
                        
                        await this.storeCDRData(results);
                        await this.updateAnalysis();
                        
                        resolve({
                            success: true,
                            count: results.length,
                            errors: errors.length > 0 ? errors : undefined,
                            message: `Successfully processed ${results.length} records${errors.length > 0 ? `, skipped ${errors.length} invalid records` : ''}`
                        });
                    } catch (error) {
                        console.error('Storage error:', error);
                        reject({
                            success: false,
                            error: 'Failed to store data',
                            details: error.message,
                            errors: errors
                        });
                    }
                })
                .on('error', (error) => {
                    console.error('CSV parsing error:', error);
                    reject({
                        success: false,
                        error: 'CSV parsing failed',
                        details: error.message
                    });
                });
        });
    }

    // Map CSV columns to CDR format with strict validation
    mapCSVToCDR(data) {
        // Create a clean copy with lowercase keys and remove any NaN or undefined
        const record = {};
        Object.keys(data).forEach(key => {
            const cleanKey = key ? key.toString().toLowerCase().trim() : '';
            const value = data[key];
            // Skip NaN, undefined, null, and empty strings
            if (value && value !== 'NaN' && value !== 'undefined' && value !== 'null') {
                record[cleanKey] = value.toString().trim();
            }
        });

        console.log('Processing record:', record);

        // Extract caller number - try multiple possible column names
        let callerNumber = null;
        const callerCandidates = ['caller', 'caller_number', 'from', 'source', 'calling_party', 'a_party'];
        for (const candidate of callerCandidates) {
            if (record[candidate] && record[candidate] !== '') {
                callerNumber = record[candidate];
                break;
            }
        }

        // Extract receiver number
        let receiverNumber = null;
        const receiverCandidates = ['receiver', 'receiver_number', 'to', 'destination', 'called_party', 'b_party'];
        for (const candidate of receiverCandidates) {
            if (record[candidate] && record[candidate] !== '') {
                receiverNumber = record[candidate];
                break;
            }
        }

        // Validate required fields
        if (!callerNumber || !receiverNumber) {
            console.log('Skipping record - missing caller or receiver');
            return null;
        }

        // Extract and validate duration
        let duration = 0;
        const durationCandidates = ['duration', 'call_duration', 'seconds', 'billsec', 'call_duration_sec'];
        for (const candidate of durationCandidates) {
            if (record[candidate] && record[candidate] !== '') {
                const parsed = parseInt(record[candidate], 10);
                if (!isNaN(parsed) && parsed >= 0) {
                    duration = parsed;
                    break;
                }
            }
        }

        // Extract date
        let callDate = null;
        const dateCandidates = ['date', 'call_date', 'calldate', 'start_date'];
        for (const candidate of dateCandidates) {
            if (record[candidate] && record[candidate] !== '') {
                const formatted = this.formatDate(record[candidate]);
                if (formatted) {
                    callDate = formatted;
                    break;
                }
            }
        }
        // Use current date if no valid date found
        if (!callDate) {
            callDate = this.getCurrentDate();
        }

        // Extract time
        let callTime = null;
        const timeCandidates = ['time', 'call_time', 'start_time'];
        for (const candidate of timeCandidates) {
            if (record[candidate] && record[candidate] !== '') {
                const formatted = this.formatTime(record[candidate]);
                if (formatted) {
                    callTime = formatted;
                    break;
                }
            }
        }
        // Use current time if no valid time found
        if (!callTime) {
            callTime = this.getCurrentTime();
        }

        // Extract and normalize call type
        let callType = 'outgoing';
        const typeCandidates = ['type', 'call_type', 'direction'];
        for (const candidate of typeCandidates) {
            if (record[candidate] && record[candidate] !== '') {
                const type = record[candidate].toLowerCase();
                if (type.includes('in') || type === 'incoming' || type === 'inbound') {
                    callType = 'incoming';
                } else if (type.includes('out') || type === 'outgoing' || type === 'outbound') {
                    callType = 'outgoing';
                } else if (type.includes('miss') || type === 'missed' || type === 'noanswer') {
                    callType = 'missed';
                }
                break;
            }
        }

        // Extract location data
        let locationLat = null;
        let locationLng = null;
        let locationName = null;

        // Try to get location name
        const locationCandidates = ['location', 'location_name', 'city', 'place'];
        for (const candidate of locationCandidates) {
            if (record[candidate] && record[candidate] !== '') {
                locationName = record[candidate].toString().trim();
                break;
            }
        }

        // Try to get latitude
        const latCandidates = ['latitude', 'lat', 'location_lat'];
        for (const candidate of latCandidates) {
            if (record[candidate] && record[candidate] !== '') {
                const parsed = parseFloat(record[candidate]);
                if (!isNaN(parsed) && parsed >= -90 && parsed <= 90) {
                    locationLat = parsed;
                    break;
                }
            }
        }

        // Try to get longitude
        const lngCandidates = ['longitude', 'lng', 'location_lng', 'lon'];
        for (const candidate of lngCandidates) {
            if (record[candidate] && record[candidate] !== '') {
                const parsed = parseFloat(record[candidate]);
                if (!isNaN(parsed) && parsed >= -180 && parsed <= 180) {
                    locationLng = parsed;
                    break;
                }
            }
        }

        // Generate dummy coordinates for locations if we have location name but no coordinates
        if (locationName && !locationLat && !locationLng) {
            const dummyCoords = this.getDummyCoordinates(locationName);
            locationLat = dummyCoords.lat;
            locationLng = dummyCoords.lng;
        }

        return {
            caller_number: this.sanitizePhoneNumber(callerNumber),
            receiver_number: this.sanitizePhoneNumber(receiverNumber),
            call_duration: duration,
            call_date: callDate,
            call_time: callTime,
            call_type: callType,
            location_lat: locationLat,
            location_lng: locationLng,
            location_name: locationName
        };
    }

    // Sanitize phone number - remove non-numeric characters but keep +
    sanitizePhoneNumber(number) {
        if (!number) return '';
        // Keep only digits and plus sign
        return number.toString().replace(/[^\d+]/g, '');
    }

    // Get dummy coordinates for common cities
    getDummyCoordinates(cityName) {
        const city = cityName.toLowerCase();
        
        // Dummy coordinates for common cities
        const coordinates = {
            'new york': { lat: 40.7128, lng: -74.0060 },
            'los angeles': { lat: 34.0522, lng: -118.2437 },
            'chicago': { lat: 41.8781, lng: -87.6298 },
            'boston': { lat: 42.3601, lng: -71.0589 },
            'miami': { lat: 25.7617, lng: -80.1918 },
            'seattle': { lat: 47.6062, lng: -122.3321 },
            'denver': { lat: 39.7392, lng: -104.9903 },
            'san francisco': { lat: 37.7749, lng: -122.4194 },
            'washington': { lat: 38.9072, lng: -77.0369 },
            'dallas': { lat: 32.7767, lng: -96.7970 },
            'houston': { lat: 29.7604, lng: -95.3698 },
            'philadelphia': { lat: 39.9526, lng: -75.1652 },
            'phoenix': { lat: 33.4484, lng: -112.0740 },
            'san antonio': { lat: 29.4241, lng: -98.4936 },
            'san diego': { lat: 32.7157, lng: -117.1611 }
        };

        // Check if we have coordinates for this city
        for (const [key, coords] of Object.entries(coordinates)) {
            if (city.includes(key)) {
                return coords;
            }
        }

        // Default random coordinates in US
        return {
            lat: 37.0902 + (Math.random() - 0.5) * 10,
            lng: -95.7129 + (Math.random() - 0.5) * 20
        };
    }

    // Format date to YYYY-MM-DD
    formatDate(date) {
        if (!date) return null;
        
        try {
            // Remove any time part if present
            const dateStr = date.toString().split(' ')[0];
            
            // Check if it's already in YYYY-MM-DD format
            if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
                return dateStr;
            }
            
            // Try to parse as Date object
            const d = new Date(dateStr);
            if (!isNaN(d.getTime())) {
                return d.toISOString().split('T')[0];
            }
        } catch (e) {
            console.log('Date parsing error:', e.message);
        }
        
        return null;
    }

    // Format time to HH:MM:SS
    formatTime(time) {
        if (!time) return null;
        
        try {
            const timeStr = time.toString().trim();
            
            // If it's already in HH:MM:SS format
            if (timeStr.match(/^\d{2}:\d{2}:\d{2}$/)) {
                return timeStr;
            }
            
            // If it's in HH:MM format
            if (timeStr.match(/^\d{2}:\d{2}$/)) {
                return timeStr + ':00';
            }
            
            // Try to extract time from datetime string
            if (timeStr.includes(' ')) {
                const parts = timeStr.split(' ');
                for (const part of parts) {
                    if (part.match(/^\d{2}:\d{2}(:\d{2})?$/)) {
                        return part.length === 5 ? part + ':00' : part;
                    }
                }
            }
        } catch (e) {
            console.log('Time parsing error:', e.message);
        }
        
        return null;
    }

    // Store CDR data in database
    async storeCDRData(records) {
        const connection = await promisePool.getConnection();
        
        try {
            await connection.beginTransaction();

            for (const record of records) {
                // Insert CDR record
                await connection.query(
                    `INSERT INTO cdr_records 
                    (caller_number, receiver_number, call_duration, call_date, call_time, call_type, location_lat, location_lng, location_name) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        record.caller_number,
                        record.receiver_number,
                        record.call_duration,
                        record.call_date,
                        record.call_time,
                        record.call_type,
                        record.location_lat,
                        record.location_lng,
                        record.location_name
                    ]
                );
            }

            await connection.commit();
            console.log(`Successfully stored ${records.length} records`);
        } catch (error) {
            await connection.rollback();
            console.error('Error storing records:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // Update analysis tables
    async updateAnalysis() {
        await this.updateContactsAnalysis();
        await this.updateRelationshipsAnalysis();
        console.log('Analysis tables updated successfully');
    }

    // Update contacts statistics
    async updateContactsAnalysis() {
        const query = `
            INSERT INTO contacts (phone_number, total_calls, total_duration, 
                                incoming_calls, outgoing_calls, missed_calls, 
                                avg_call_duration, last_call_date)
            SELECT 
                phone_number,
                COUNT(*) as total_calls,
                SUM(call_duration) as total_duration,
                SUM(CASE WHEN call_type = 'incoming' THEN 1 ELSE 0 END) as incoming_calls,
                SUM(CASE WHEN call_type = 'outgoing' THEN 1 ELSE 0 END) as outgoing_calls,
                SUM(CASE WHEN call_type = 'missed' THEN 1 ELSE 0 END) as missed_calls,
                AVG(call_duration) as avg_call_duration,
                MAX(call_date) as last_call_date
            FROM (
                SELECT caller_number as phone_number, call_duration, call_type, call_date FROM cdr_records
                UNION ALL
                SELECT receiver_number as phone_number, call_duration, 
                       CASE WHEN call_type = 'outgoing' THEN 'incoming' 
                            WHEN call_type = 'incoming' THEN 'outgoing' 
                            ELSE call_type END, 
                       call_date FROM cdr_records
            ) all_calls
            GROUP BY phone_number
            ON DUPLICATE KEY UPDATE
                total_calls = VALUES(total_calls),
                total_duration = VALUES(total_duration),
                incoming_calls = VALUES(incoming_calls),
                outgoing_calls = VALUES(outgoing_calls),
                missed_calls = VALUES(missed_calls),
                avg_call_duration = VALUES(avg_call_duration),
                last_call_date = VALUES(last_call_date),
                updated_at = CURRENT_TIMESTAMP
        `;
        
        await promisePool.query(query);
    }

    // Update call relationships
    async updateRelationshipsAnalysis() {
        const query = `
            INSERT INTO call_relationships (caller_number, receiver_number, call_count, 
                                          total_duration, first_call_date, last_call_date)
            SELECT 
                caller_number,
                receiver_number,
                COUNT(*) as call_count,
                SUM(call_duration) as total_duration,
                MIN(call_date) as first_call_date,
                MAX(call_date) as last_call_date
            FROM cdr_records
            GROUP BY caller_number, receiver_number
            ON DUPLICATE KEY UPDATE
                call_count = VALUES(call_count),
                total_duration = VALUES(total_duration),
                first_call_date = VALUES(first_call_date),
                last_call_date = VALUES(last_call_date)
        `;
        
        await promisePool.query(query);
    }

    getCurrentDate() {
        return new Date().toISOString().split('T')[0];
    }

    getCurrentTime() {
        return new Date().toTimeString().split(' ')[0];
    }
}

module.exports = new CSVService();