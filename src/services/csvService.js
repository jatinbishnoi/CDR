const fs = require('fs');
const csv = require('csv-parser');
const { getPools } = require('../config/database');

class CSVService {
    
    constructor() {
        this.pools = null;
    }

    async initPools() {
        if (!this.pools) {
            this.pools = await getPools();
        }
        return this.pools;
    }

    // Process and store CDR data from CSV
    async processCDRFile(filePath) {
        const results = [];
        const errors = [];
        
        return new Promise((resolve, reject) => {
            fs.createReadStream(filePath)
                .pipe(csv({
                    mapValues: ({ header, index, value }) => {
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

    // Map CSV columns to CDR format
    mapCSVToCDR(data) {
        const record = {};
        Object.keys(data).forEach(key => {
            const cleanKey = key ? key.toString().toLowerCase().trim() : '';
            const value = data[key];
            if (value && value !== 'NaN' && value !== 'undefined' && value !== 'null') {
                record[cleanKey] = value.toString().trim();
            }
        });

        // Extract caller number
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

        // Extract duration
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
        let callDate = this.formatDate(record['date'] || record['call_date'] || record['calldate'] || this.getCurrentDate());

        // Extract time
        let callTime = this.formatTime(record['time'] || record['call_time'] || record['start_time'] || this.getCurrentTime());

        // Extract call type
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

        // Extract location
        let locationLat = null;
        let locationLng = null;
        let locationName = null;

        const locationCandidates = ['location', 'location_name', 'city', 'place'];
        for (const candidate of locationCandidates) {
            if (record[candidate] && record[candidate] !== '') {
                locationName = record[candidate].toString().trim();
                break;
            }
        }

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

        // Generate dummy coordinates if we have location name but no coordinates
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

    // Sanitize phone number
    sanitizePhoneNumber(number) {
        if (!number) return '';
        return number.toString().replace(/[^\d+]/g, '');
    }

    // Get dummy coordinates for cities
    getDummyCoordinates(cityName) {
        const city = cityName.toLowerCase();
        
        const coordinates = {
            'new york': { lat: 40.7128, lng: -74.0060 },
            'los angeles': { lat: 34.0522, lng: -118.2437 },
            'chicago': { lat: 41.8781, lng: -87.6298 },
            'boston': { lat: 42.3601, lng: -71.0589 },
            'miami': { lat: 25.7617, lng: -80.1918 },
            'seattle': { lat: 47.6062, lng: -122.3321 },
            'denver': { lat: 39.7392, lng: -104.9903 },
            'san francisco': { lat: 37.7749, lng: -122.4194 }
        };

        for (const [key, coords] of Object.entries(coordinates)) {
            if (city.includes(key)) {
                return coords;
            }
        }

        return {
            lat: 37.0902 + (Math.random() - 0.5) * 10,
            lng: -95.7129 + (Math.random() - 0.5) * 20
        };
    }

    // Format date to YYYY-MM-DD
    formatDate(date) {
        if (!date) return this.getCurrentDate();
        
        try {
            const dateStr = date.toString().split(' ')[0];
            if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
                return dateStr;
            }
            
            const d = new Date(dateStr);
            if (!isNaN(d.getTime())) {
                return d.toISOString().split('T')[0];
            }
        } catch (e) {
            console.log('Date parsing error:', e.message);
        }
        
        return this.getCurrentDate();
    }

    // Format time to HH:MM:SS
    formatTime(time) {
        if (!time) return this.getCurrentTime();
        
        try {
            const timeStr = time.toString().trim();
            
            if (timeStr.match(/^\d{2}:\d{2}:\d{2}$/)) {
                return timeStr;
            }
            
            if (timeStr.match(/^\d{2}:\d{2}$/)) {
                return timeStr + ':00';
            }
            
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
        
        return this.getCurrentTime();
    }

    // Store CDR data in database
    async storeCDRData(records) {
        const pools = await this.initPools();
        const promiseCdrPool = pools.promiseCdrPool;
        const connection = await promiseCdrPool.getConnection();
        
        try {
            await connection.beginTransaction();

            for (const record of records) {
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
            console.log(`Successfully stored ${records.length} records in CDR database`);
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
        const pools = await this.initPools();
        const promiseCdrPool = pools.promiseCdrPool;
        
        await this.updateContactsAnalysis(promiseCdrPool);
        await this.updateRelationshipsAnalysis(promiseCdrPool);
        console.log('Analysis tables updated successfully');
    }

    // Update contacts statistics
    async updateContactsAnalysis(promiseCdrPool) {
        const query = `
            INSERT INTO contacts (phone_number, total_calls, total_duration, 
                                incoming_calls, outgoing_calls, missed_calls, 
                                avg_call_duration, last_call_date)
            SELECT 
                phone_number,
                SUM(call_count) as total_calls,
                SUM(total_duration) as total_duration,
                SUM(incoming_count) as incoming_calls,
                SUM(outgoing_count) as outgoing_calls,
                SUM(missed_count) as missed_calls,
                AVG(avg_duration) as avg_call_duration,
                MAX(max_date) as last_call_date
            FROM (
                SELECT 
                    caller_number as phone_number,
                    COUNT(*) as call_count,
                    SUM(call_duration) as total_duration,
                    SUM(CASE WHEN call_type = 'incoming' THEN 1 ELSE 0 END) as incoming_count,
                    SUM(CASE WHEN call_type = 'outgoing' THEN 1 ELSE 0 END) as outgoing_count,
                    SUM(CASE WHEN call_type = 'missed' THEN 1 ELSE 0 END) as missed_count,
                    AVG(call_duration) as avg_duration,
                    MAX(call_date) as max_date
                FROM cdr_records
                GROUP BY caller_number
                UNION ALL
                SELECT 
                    receiver_number as phone_number,
                    COUNT(*) as call_count,
                    SUM(call_duration) as total_duration,
                    SUM(CASE WHEN call_type = 'outgoing' THEN 1 ELSE 0 END) as incoming_count,
                    SUM(CASE WHEN call_type = 'incoming' THEN 1 ELSE 0 END) as outgoing_count,
                    SUM(CASE WHEN call_type = 'missed' THEN 1 ELSE 0 END) as missed_count,
                    AVG(call_duration) as avg_duration,
                    MAX(call_date) as max_date
                FROM cdr_records
                GROUP BY receiver_number
            ) all_calls
            GROUP BY phone_number
            ON DUPLICATE KEY UPDATE
                total_calls = contacts.total_calls + VALUES(total_calls),
                total_duration = contacts.total_duration + VALUES(total_duration),
                incoming_calls = contacts.incoming_calls + VALUES(incoming_calls),
                outgoing_calls = contacts.outgoing_calls + VALUES(outgoing_calls),
                missed_calls = contacts.missed_calls + VALUES(missed_calls),
                avg_call_duration = (contacts.total_duration + VALUES(total_duration)) / (contacts.total_calls + VALUES(total_calls)),
                last_call_date = GREATEST(contacts.last_call_date, VALUES(last_call_date)),
                updated_at = CURRENT_TIMESTAMP
        `;
        
        await promiseCdrPool.query(query);
    }

    // Update call relationships
    async updateRelationshipsAnalysis(promiseCdrPool) {
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
                call_count = call_count + VALUES(call_count),
                total_duration = total_duration + VALUES(total_duration),
                first_call_date = LEAST(first_call_date, VALUES(first_call_date)),
                last_call_date = GREATEST(last_call_date, VALUES(last_call_date))
        `;
        
        await promiseCdrPool.query(query);
    }

    getCurrentDate() {
        return new Date().toISOString().split('T')[0];
    }

    getCurrentTime() {
        return new Date().toTimeString().split(' ')[0];
    }
}

module.exports = new CSVService();