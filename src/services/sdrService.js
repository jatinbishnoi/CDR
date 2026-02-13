const fs = require('fs');
const csv = require('csv-parser');
const { getPools } = require('../config/database');

class SDRService {
    
    constructor() {
        this.pools = null;
    }

    async initPools() {
        if (!this.pools) {
            this.pools = await getPools();
        }
        return this.pools;
    }

    // Normalize mobile number to handle different formats
    normalizeMobileNumber(number) {
        if (!number) return null;
        
        // Remove all non-numeric characters
        let cleaned = number.toString().replace(/\D/g, '');
        
        // Handle different formats
        if (cleaned.length === 12 && cleaned.startsWith('91')) {
            // Indian number with country code (917628903508 -> 7628903508? Wait, this is 12 digits)
            return cleaned;
        } else if (cleaned.length === 10) {
            // 10 digit number
            return cleaned;
        } else if (cleaned.length > 10) {
            // Take last 10 digits
            return cleaned.slice(-10);
        }
        
        return cleaned;
    }

    // Parse LBS message and fetch complete SDR details
    async getSDRDetailsFromLBS(lbsMessage) {
        try {
            console.log('Processing LBS Message:', lbsMessage);
            
            // Extract details from LBS message
            const extracted = {
                mobile_number: null,
                imsi: null,
                imei: null,
                location_time: null,
                vlr: null,
                cgi: null,
                latitude: null,
                longitude: null,
                request_id: null
            };

            // Split message into lines
            const lines = lbsMessage.split('\n');
            
            for (const line of lines) {
                const trimmed = line.trim();
                
                // Extract MOB (Mobile Number)
                if (trimmed.startsWith('MOB')) {
                    const rawNumber = trimmed.replace('MOB', '').trim().replace(/\s+/g, '');
                    extracted.mobile_number = this.normalizeMobileNumber(rawNumber);
                    console.log('Extracted mobile:', rawNumber, 'normalized to:', extracted.mobile_number);
                }
                
                // Extract L. Act. (Location Time)
                if (trimmed.startsWith('L. Act.')) {
                    extracted.location_time = trimmed.replace('L. Act.', '').trim();
                }
                
                // Extract VLR
                if (trimmed.startsWith('VLR')) {
                    extracted.vlr = trimmed.replace('VLR', '').trim();
                }
                
                // Extract IMEI
                if (trimmed.startsWith('IMEI')) {
                    extracted.imei = trimmed.replace('IMEI', '').trim().replace(/\s+/g, '');
                }
                
                // Extract IMSI
                if (trimmed.startsWith('IMSI')) {
                    extracted.imsi = trimmed.replace('IMSI', '').trim().replace(/\s+/g, '');
                }
                
                // Extract CGI
                if (trimmed.startsWith('CGI')) {
                    extracted.cgi = trimmed.replace('CGI', '').trim();
                }
                
                // Extract Latitude
                if (trimmed.startsWith('Lat')) {
                    extracted.latitude = parseFloat(trimmed.replace('Lat', '').trim());
                }
                
                // Extract Longitude
                if (trimmed.startsWith('Long')) {
                    extracted.longitude = parseFloat(trimmed.replace('Long', '').trim());
                }
                
                // Extract Request ID
                if (trimmed.startsWith('Request ID:')) {
                    extracted.request_id = trimmed.replace('Request ID:', '').trim();
                }
            }

            console.log('Extracted from LBS:', extracted);

            // Now fetch SDR details using the extracted information
            const pools = await this.initPools();
            const promiseSdrPool = pools.promiseSdrPool;
            
            let sdrData = null;
            let searchMethod = '';

            // Try multiple search strategies

            // Strategy 1: Try by mobile number with different formats
            if (extracted.mobile_number) {
                // Try exact match
                const [rows] = await promiseSdrPool.query(
                    'SELECT * FROM sdr_records WHERE mobile_number = ?',
                    [extracted.mobile_number]
                );
                
                if (rows.length > 0) {
                    sdrData = rows[0];
                    searchMethod = 'mobile_number_exact';
                } else {
                    // Try with last 10 digits if number is longer
                    const last10Digits = extracted.mobile_number.slice(-10);
                    const [rows10] = await promiseSdrPool.query(
                        'SELECT * FROM sdr_records WHERE mobile_number LIKE ?',
                        [`%${last10Digits}`]
                    );
                    if (rows10.length > 0) {
                        sdrData = rows10[0];
                        searchMethod = 'mobile_number_last10';
                    }
                }
            }

            // Strategy 2: Try by IMSI
            if (!sdrData && extracted.imsi) {
                const [rows] = await promiseSdrPool.query(
                    'SELECT * FROM sdr_records WHERE imsi = ?',
                    [extracted.imsi]
                );
                if (rows.length > 0) {
                    sdrData = rows[0];
                    searchMethod = 'imsi';
                }
            }

            // Strategy 3: Try by IMEI
            if (!sdrData && extracted.imei) {
                const [rows] = await promiseSdrPool.query(
                    'SELECT * FROM sdr_records WHERE imei = ?',
                    [extracted.imei]
                );
                if (rows.length > 0) {
                    sdrData = rows[0];
                    searchMethod = 'imei';
                }
            }

            // Store this LBS tracking data
            if (sdrData) {
                await promiseSdrPool.query(
                    `INSERT INTO lbs_tracking 
                    (mobile_number, imsi, imei, latitude, longitude, location_time, 
                     cgi, vlr, request_id, raw_message, sdr_id) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        sdrData.mobile_number,
                        sdrData.imsi,
                        sdrData.imei,
                        extracted.latitude,
                        extracted.longitude,
                        this.parseLBSDate(extracted.location_time),
                        extracted.cgi,
                        extracted.vlr,
                        extracted.request_id,
                        lbsMessage,
                        sdrData.id
                    ]
                );
            }

            // Prepare comprehensive response
            const response = {
                success: true,
                search_method: searchMethod || 'not_found',
                lbs_data: extracted,
                sdr_data: sdrData ? {
                    // Personal Information
                    mobile_number: sdrData.mobile_number,
                    first_name: sdrData.first_name,
                    last_name: sdrData.last_name,
                    father_name: sdrData.father_name,
                    spouse_name: sdrData.spouse_name,
                    gender: sdrData.gender,
                    date_of_birth: sdrData.date_of_birth,
                    nationality: sdrData.nationality,
                    
                    // Contact Information
                    alternate_contact: sdrData.alternate_contact,
                    email: sdrData.email,
                    
                    // Address Information
                    address: sdrData.address,
                    permanent_address: sdrData.permanent_address,
                    city: sdrData.city,
                    district: sdrData.district,
                    state: sdrData.state,
                    pin_code: sdrData.pin_code,
                    
                    // Identification
                    id_type: sdrData.id_type,
                    id_number: sdrData.id_number,
                    
                    // Subscription Details
                    subscription_type: sdrData.subscription_type,
                    activation_date: sdrData.activation_date,
                    subscriber_status: sdrData.subscriber_status,
                    circle_code: sdrData.circle_code,
                    
                    // SIM Details
                    imsi: sdrData.imsi,
                    imei: sdrData.imei,
                    sim_type: sdrData.sim_type,
                    
                    // Current Location (from LBS)
                    current_location: {
                        latitude: extracted.latitude,
                        longitude: extracted.longitude,
                        location_time: extracted.location_time,
                        map_url: extracted.latitude && extracted.longitude ? 
                            `https://maps.google.com/maps?q=${extracted.latitude},${extracted.longitude}` : null
                    }
                } : null,
                
                // If not found in SDR database
                message: sdrData ? 'Subscriber found in SDR database' : 'Subscriber not found in SDR database'
            };

            return response;

        } catch (error) {
            console.error('Error in getSDRDetailsFromLBS:', error);
            throw error;
        }
    }

    // Process LBS message
    async processLBSMessage(message) {
        const { promiseSdrPool } = await this.initPools();
        const lbsData = this.parseLBSMessage(message);
        
        if (!lbsData.mobile_number) {
            throw new Error('No mobile number found in LBS message');
        }

        const connection = await promiseSdrPool.getConnection();
        
        try {
            await connection.beginTransaction();

            // Find SDR record for this mobile/IMSI/IMEI
            let sdrRecord = null;
            
            if (lbsData.mobile_number) {
                [sdrRecord] = await connection.query(
                    'SELECT * FROM sdr_records WHERE mobile_number = ?',
                    [lbsData.mobile_number]
                );
            }
            
            if (!sdrRecord[0] && lbsData.imsi) {
                [sdrRecord] = await connection.query(
                    'SELECT * FROM sdr_records WHERE imsi = ?',
                    [lbsData.imsi]
                );
            }
            
            if (!sdrRecord[0] && lbsData.imei) {
                [sdrRecord] = await connection.query(
                    'SELECT * FROM sdr_records WHERE imei = ?',
                    [lbsData.imei]
                );
            }

            // Insert LBS tracking record
            const [lbsResult] = await connection.query(
                `INSERT INTO lbs_tracking 
                (mobile_number, imsi, imei, latitude, longitude, location_time, 
                 cgi, vlr, request_id, raw_message, sdr_id) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    lbsData.mobile_number,
                    lbsData.imsi,
                    lbsData.imei,
                    lbsData.latitude,
                    lbsData.longitude,
                    lbsData.location_time,
                    lbsData.cgi,
                    lbsData.vlr,
                    lbsData.request_id,
                    lbsData.raw_message,
                    sdrRecord[0]?.id || null
                ]
            );

            await connection.commit();
            
            return {
                lbs_tracking_id: lbsResult.insertId,
                mobile_number: lbsData.mobile_number,
                location: { lat: lbsData.latitude, lng: lbsData.longitude },
                time: lbsData.location_time,
                sdr_record: sdrRecord[0] || null,
                map_url: lbsData.latitude && lbsData.longitude ? 
                    `http://maps.google.com/maps?q=${lbsData.latitude},${lbsData.longitude}` : null
            };
            
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    // Parse Airtel LBS message
    parseLBSMessage(message) {
        const lbsData = {
            mobile_number: null,
            imsi: null,
            imei: null,
            latitude: null,
            longitude: null,
            location_time: null,
            cgi: null,
            vlr: null,
            request_id: null,
            raw_message: message
        };

        const lines = message.split('\n');
        
        for (const line of lines) {
            const trimmed = line.trim();
            
            if (trimmed.startsWith('MOB')) {
                const rawNumber = trimmed.replace('MOB', '').trim().replace(/\s+/g, '');
                lbsData.mobile_number = this.normalizeMobileNumber(rawNumber);
            }
            
            if (trimmed.startsWith('L. Act.')) {
                const dateStr = trimmed.replace('L. Act.', '').trim();
                lbsData.location_time = this.parseLBSDate(dateStr);
            }
            
            if (trimmed.startsWith('CGI')) {
                lbsData.cgi = trimmed.replace('CGI', '').trim();
            }
            
            if (trimmed.startsWith('VLR')) {
                lbsData.vlr = trimmed.replace('VLR', '').trim();
            }
            
            if (trimmed.startsWith('IMEI')) {
                lbsData.imei = trimmed.replace('IMEI', '').trim().replace(/\s+/g, '');
            }
            
            if (trimmed.startsWith('IMSI')) {
                lbsData.imsi = trimmed.replace('IMSI', '').trim().replace(/\s+/g, '');
            }
            
            if (trimmed.startsWith('Lat')) {
                lbsData.latitude = parseFloat(trimmed.replace('Lat', '').trim());
            }
            
            if (trimmed.startsWith('Long')) {
                lbsData.longitude = parseFloat(trimmed.replace('Long', '').trim());
            }
            
            if (trimmed.startsWith('Request ID:')) {
                lbsData.request_id = trimmed.replace('Request ID:', '').trim();
            }
        }
        
        return lbsData;
    }

    // Parse LBS date format
    parseLBSDate(dateStr) {
        if (!dateStr) return null;
        try {
            const [datePart, timePart] = dateStr.split(' ');
            const [day, month, year] = datePart.split('-');
            return `${year}-${month}-${day} ${timePart}`;
        } catch (e) {
            return new Date().toISOString().slice(0, 19).replace('T', ' ');
        }
    }

    // Import SDR data from CSV
    async importSDRFromCSV(filePath, filename) {
        const results = [];
        const errors = [];
        
        return new Promise((resolve, reject) => {
            fs.createReadStream(filePath)
                .pipe(csv())
                .on('data', (data) => {
                    try {
                        const sdrRecord = this.mapCSVToSDR(data);
                        if (sdrRecord && sdrRecord.mobile_number) {
                            results.push(sdrRecord);
                        } else {
                            errors.push({ data, error: 'Missing mobile number' });
                        }
                    } catch (err) {
                        errors.push({ data, error: err.message });
                    }
                })
                .on('end', async () => {
                    try {
                        const { promiseSdrPool } = await this.initPools();
                        
                        // Log import start
                        const [importResult] = await promiseSdrPool.query(
                            `INSERT INTO sdr_imports 
                            (filename, record_count, status) 
                            VALUES (?, ?, ?)`,
                            [filename, results.length, 'processing']
                        );
                        
                        const importId = importResult.insertId;
                        const importResult_details = await this.bulkInsertSDR(results);
                        
                        // Update import status
                        await promiseSdrPool.query(
                            `UPDATE sdr_imports 
                             SET success_count = ?, error_count = ?, status = ? 
                             WHERE id = ?`,
                            [
                                importResult_details.successCount, 
                                errors.length, 
                                errors.length > 0 ? 'partial' : 'success',
                                importId
                            ]
                        );
                        
                        resolve({
                            success: true,
                            total: results.length + errors.length,
                            imported: importResult_details.successCount,
                            errors: errors.length,
                            details: importResult_details.details
                        });
                    } catch (error) {
                        console.error('Import error:', error);
                        reject(error);
                    }
                })
                .on('error', reject);
        });
    }

    // Bulk insert SDR records
    async bulkInsertSDR(records) {
        const { promiseSdrPool } = await this.initPools();
        const connection = await promiseSdrPool.getConnection();
        let successCount = 0;
        const details = [];

        try {
            await connection.beginTransaction();

            for (const record of records) {
                try {
                    console.log('Inserting record:', record.mobile_number);
                    
                    const [result] = await connection.query(
                        `INSERT INTO sdr_records 
                        (mobile_number, imsi, imei, first_name, last_name, father_name, 
                         spouse_name, gender, date_of_birth, nationality, alternate_contact,
                         address, permanent_address, city, district, state, pin_code,
                         id_type, id_number, subscription_type, activation_date, 
                         subscriber_status, circle_code, sim_type, data_source)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE
                         first_name = VALUES(first_name),
                         last_name = VALUES(last_name),
                         father_name = VALUES(father_name),
                         address = VALUES(address),
                         city = VALUES(city),
                         state = VALUES(state),
                         imsi = VALUES(imsi),
                         imei = VALUES(imei),
                         updated_at = CURRENT_TIMESTAMP`,
                        [
                            record.mobile_number, 
                            record.imsi, 
                            record.imei,
                            record.first_name, 
                            record.last_name, 
                            record.father_name,
                            record.spouse_name, 
                            record.gender, 
                            record.date_of_birth,
                            record.nationality, 
                            record.alternate_contact,
                            record.address, 
                            record.permanent_address,
                            record.city, 
                            record.district, 
                            record.state, 
                            record.pin_code,
                            record.id_type, 
                            record.id_number, 
                            record.subscription_type,
                            record.activation_date, 
                            record.subscriber_status,
                            record.circle_code, 
                            record.sim_type, 
                            'CSV Import'
                        ]
                    );
                    
                    successCount++;
                    details.push({ mobile: record.mobile_number, status: 'success' });
                    
                } catch (err) {
                    console.error('Error inserting record:', record.mobile_number, err.message);
                    details.push({ mobile: record.mobile_number, status: 'failed', error: err.message });
                }
            }

            await connection.commit();
            return { successCount, details };
            
        } catch (error) {
            await connection.rollback();
            console.error('Bulk insert error:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // Map CSV to SDR format
    mapCSVToSDR(data) {
        console.log('Raw CSV data:', data);
        
        const record = {};
        
        Object.keys(data).forEach(key => {
            const cleanKey = key.toLowerCase()
                .replace(/[^a-z0-9_]/g, '_')
                .replace(/_+/g, '_')
                .replace(/^_|_$/g, '');
            record[cleanKey] = data[key] && data[key] !== 'None' ? data[key].toString().trim() : null;
        });
        
        console.log('Processed record:', record);

        return {
            mobile_number: this.normalizeMobileNumber(this.extractValue(record, [
                'subscriber_contact', 'mobile_number', 'mobile', 'contact', 'phone', 'mobile_no'
            ])),
            imsi: this.extractValue(record, ['imsi', 'mobile_imsi']),
            imei: this.extractValue(record, ['imei', 'mobile_imei']),
            
            first_name: this.extractValue(record, [
                'subscriber_first_name', 'first_name', 'firstname', 'fname', 'first'
            ]),
            last_name: this.extractValue(record, [
                'subscriber_last_name', 'last_name', 'lastname', 'lname', 'last'
            ]),
            father_name: this.extractValue(record, ['father_name', 'fathername', 'father']),
            spouse_name: this.extractValue(record, ['spouse_name', 'spousename', 'spouse']),
            gender: this.extractValue(record, ['gender']),
            date_of_birth: this.parseDate(this.extractValue(record, [
                'date_of_birth', 'dob', 'birth_date', 'birthdate'
            ])),
            nationality: this.extractValue(record, ['nationality']),
            
            alternate_contact: this.extractValue(record, [
                'alternate_contact', 'alternate_number', 'alt_contact', 'alt_phone'
            ]),
            
            address: this.extractValue(record, [
                'subscriber_s_address', 'address', 'subscriber_address', 'addr'
            ]),
            permanent_address: this.extractValue(record, [
                'permanent_address', 'perm_address', 'permanent_addr'
            ]),
            city: this.extractValue(record, ['city', 'town']),
            district: this.extractValue(record, ['district']),
            state: this.extractValue(record, ['state']),
            pin_code: this.extractValue(record, ['pin', 'pin_code', 'postal_code', 'pincode']),
            
            id_type: this.extractValue(record, ['identification_id', 'id_type', 'idtype']),
            id_number: this.extractValue(record, ['identification_number', 'id_number', 'idnumber']),
            
            subscription_type: this.extractValue(record, [
                'subscription_type', 'sub_type', 'subscriptiontype'
            ]),
            activation_date: this.parseDateTime(this.extractValue(record, [
                'date_of_activation', 'activation_date', 'activation'
            ])),
            subscriber_status: this.extractValue(record, [
                'subscriber_status', 'status'
            ]) || 'Active',
            circle_code: this.extractValue(record, ['circle_of_subscriber', 'circle_code']),
            
            sim_type: this.extractValue(record, ['sim_type']) || 'Physical'
        };
    }

    extractValue(record, keys) {
        for (const key of keys) {
            if (record[key] && record[key] !== 'None' && record[key] !== '') {
                return record[key];
            }
        }
        return null;
    }

    parseDate(dateStr) {
        if (!dateStr || dateStr === 'None') return null;
        try {
            const d = new Date(dateStr);
            return d.toISOString().split('T')[0];
        } catch {
            return null;
        }
    }

    parseDateTime(dateTimeStr) {
        if (!dateTimeStr || dateTimeStr === 'None') return null;
        try {
            const d = new Date(dateTimeStr);
            return d.toISOString().slice(0, 19).replace('T', ' ');
        } catch {
            return null;
        }
    }

    // Search SDR records
    async searchSDR(query) {
        const { promiseSdrPool } = await this.initPools();
        let sql = 'SELECT * FROM sdr_records WHERE 1=1';
        const params = [];

        if (query.mobile_number) {
            const normalized = this.normalizeMobileNumber(query.mobile_number);
            sql += ' AND (mobile_number = ? OR mobile_number LIKE ?)';
            params.push(normalized, `%${normalized.slice(-10)}`);
        }

        if (query.imsi) {
            sql += ' AND imsi = ?';
            params.push(query.imsi);
        }

        if (query.imei) {
            sql += ' AND imei = ?';
            params.push(query.imei);
        }

        if (query.name) {
            sql += ' AND (first_name LIKE ? OR last_name LIKE ?)';
            params.push(`%${query.name}%`, `%${query.name}%`);
        }

        if (query.city) {
            sql += ' AND city LIKE ?';
            params.push(`%${query.city}%`);
        }

        if (query.state) {
            sql += ' AND state = ?';
            params.push(query.state);
        }

        if (query.status) {
            sql += ' AND subscriber_status = ?';
            params.push(query.status);
        }

        sql += ' ORDER BY created_at DESC LIMIT 100';

        const [rows] = await promiseSdrPool.query(sql, params);
        return rows;
    }
// Lookup SDR by LBS components
async lookupSDRByComponents(components) {
    try {
        console.log('Looking up SDR with components:', components);
        
        // Extract and normalize mobile number
        const mobileNumber = this.normalizeMobileNumber(components.MOB);
        const imsi = components.IMSI;
        const imei = components.IMEI;
        
        // Get current timestamp for location
        const locationTime = components.L_Act || new Date().toISOString();
        
        // Initialize pools
        const pools = await this.initPools();
        const promiseSdrPool = pools.promiseSdrPool;
        
        let sdrData = null;
        let searchMethod = '';

        // Try to find by mobile number first
        if (mobileNumber) {
            // Try exact match
            const [rows] = await promiseSdrPool.query(
                'SELECT * FROM sdr_records WHERE mobile_number = ?',
                [mobileNumber]
            );
            
            if (rows.length > 0) {
                sdrData = rows[0];
                searchMethod = 'mobile_number_exact';
            } else {
                // Try with last 10 digits
                const last10Digits = mobileNumber.slice(-10);
                const [rows10] = await promiseSdrPool.query(
                    'SELECT * FROM sdr_records WHERE mobile_number LIKE ?',
                    [`%${last10Digits}`]
                );
                if (rows10.length > 0) {
                    sdrData = rows10[0];
                    searchMethod = 'mobile_number_last10';
                }
            }
        }

        // If not found, try by IMSI
        if (!sdrData && imsi) {
            const [rows] = await promiseSdrPool.query(
                'SELECT * FROM sdr_records WHERE imsi = ?',
                [imsi]
            );
            if (rows.length > 0) {
                sdrData = rows[0];
                searchMethod = 'imsi';
            }
        }

        // If not found, try by IMEI
        if (!sdrData && imei) {
            const [rows] = await promiseSdrPool.query(
                'SELECT * FROM sdr_records WHERE imei = ?',
                [imei]
            );
            if (rows.length > 0) {
                sdrData = rows[0];
                searchMethod = 'imei';
            }
        }

        // Store LBS tracking data if subscriber found
        if (sdrData) {
            await promiseSdrPool.query(
                `INSERT INTO lbs_tracking 
                (mobile_number, imsi, imei, location_time, cgi, vlr, raw_message, sdr_id) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    sdrData.mobile_number,
                    sdrData.imsi,
                    sdrData.imei,
                    this.parseDate(locationTime),
                    components.CGI,
                    components.VLR,
                    JSON.stringify(components),
                    sdrData.id
                ]
            );
        }

        // Prepare comprehensive response
        const response = {
            success: true,
            timestamp: new Date().toISOString(),
            search_method: searchMethod || 'not_found',
            query_components: components,
            
            // Subscriber Details (if found)
            subscriber: sdrData ? {
                // Personal Information
                mobile_number: sdrData.mobile_number,
                first_name: sdrData.first_name,
                last_name: sdrData.last_name,
                full_name: `${sdrData.first_name || ''} ${sdrData.last_name || ''}`.trim(),
                father_name: sdrData.father_name,
                spouse_name: sdrData.spouse_name,
                gender: sdrData.gender,
                date_of_birth: sdrData.date_of_birth,
                age: sdrData.date_of_birth ? this.calculateAge(sdrData.date_of_birth) : null,
                nationality: sdrData.nationality,
                
                // Contact Information
                alternate_contact: sdrData.alternate_contact,
                email: sdrData.email,
                
                // Address Information
                address: sdrData.address,
                permanent_address: sdrData.permanent_address,
                city: sdrData.city,
                district: sdrData.district,
                state: sdrData.state,
                pin_code: sdrData.pin_code,
                full_address: [sdrData.address, sdrData.city, sdrData.state, sdrData.pin_code]
                    .filter(Boolean).join(', '),
                
                // Identification
                id_type: sdrData.id_type,
                id_number: sdrData.id_number,
                
                // Subscription Details
                subscription_type: sdrData.subscription_type,
                activation_date: sdrData.activation_date,
                subscriber_status: sdrData.subscriber_status,
                circle_code: sdrData.circle_code,
                
                // SIM Details
                imsi: sdrData.imsi,
                imei: sdrData.imei,
                sim_type: sdrData.sim_type,
                
                // Network Information (from LBS)
                current_network: {
                    cgi: components.CGI,
                    vlr: components.VLR,
                    location_time: components.L_Act
                },
                
                // Account Age
                account_age_days: sdrData.activation_date ? 
                    this.calculateDaysBetween(sdrData.activation_date, new Date()) : null,
                
                // Record Metadata
                created_at: sdrData.created_at,
                updated_at: sdrData.updated_at,
                data_source: sdrData.data_source
                
            } : null,
            
            // Summary
            summary: {
                found: sdrData ? true : false,
                message: sdrData ? 'Subscriber found in database' : 'No subscriber found with provided details',
                search_criteria: {
                    by_mobile: !!mobileNumber,
                    by_imsi: !!imsi,
                    by_imei: !!imei
                }
            }
        };

        return response;

    } catch (error) {
        console.error('Error in lookupSDRByComponents:', error);
        throw error;
    }
}

// Helper function to calculate age from date of birth
calculateAge(dateOfBirth) {
    if (!dateOfBirth) return null;
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
}

// Helper function to calculate days between two dates
calculateDaysBetween(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
}
    // Get location history for a mobile number
    async getLocationHistory(mobileNumber, days = 7) {
        const { promiseSdrPool } = await this.initPools();
        const [rows] = await promiseSdrPool.query(
            `SELECT lt.*, sdr.first_name, sdr.last_name 
             FROM lbs_tracking lt
             LEFT JOIN sdr_records sdr ON lt.sdr_id = sdr.id
             WHERE lt.mobile_number = ? 
               AND lt.location_time >= DATE_SUB(NOW(), INTERVAL ? DAY)
             ORDER BY lt.location_time DESC`,
            [mobileNumber, days]
        );
        return rows;
    }
}

module.exports = new SDRService();