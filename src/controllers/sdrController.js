const sdrService = require('../services/sdrService');
const { getPools } = require('../config/database');

class SDRController {

    // Process LBS message
    async processLBS(req, res) {
        try {
            const { message } = req.body;

            if (!message) {
                return res.status(400).json({ error: 'LBS message is required' });
            }

            const result = await sdrService.processLBSMessage(message);

            res.status(200).json({
                success: true,
                data: result
            });

        } catch (error) {
            console.error('LBS Processing Error:', error);
            res.status(500).json({ error: error.message });
        }
    }

    // Import SDR from CSV
    async importSDR(req, res) {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'No file uploaded' });
            }

            console.log('File received:', req.file.originalname);

            const result = await sdrService.importSDRFromCSV(
                req.file.path,
                req.file.originalname
            );

            res.status(200).json(result);

        } catch (error) {
            console.error('SDR Import Error:', error);
            res.status(500).json({ error: error.message });
        }
    }

    // Search SDR records
    async searchSDR(req, res) {
        try {
            const results = await sdrService.searchSDR(req.query);
            res.status(200).json({
                success: true,
                count: results.length,
                data: results
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // Get all SDR records
    async getAllSDR(req, res) {
        try {
            const { promiseSdrPool } = await getPools();
            const [rows] = await promiseSdrPool.query(`
                SELECT 
                    id, mobile_number, first_name, last_name, father_name,
                    gender, date_of_birth, nationality, alternate_contact,
                    address, city, district, state, pin_code,
                    id_type, subscription_type, activation_date,
                    subscriber_status, imsi, imei
                FROM sdr_records 
                ORDER BY created_at DESC
                LIMIT 100
            `);

            res.status(200).json({
                success: true,
                count: rows.length,
                data: rows
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // Get SDR by mobile number
    async getByMobile(req, res) {
        try {
            const { promiseSdrPool } = await getPools();
            const { mobile } = req.params;
            const [rows] = await promiseSdrPool.query(
                'SELECT * FROM sdr_records WHERE mobile_number = ?',
                [mobile]
            );

            if (rows.length === 0) {
                return res.status(404).json({ error: 'Subscriber not found' });
            }

            res.status(200).json(rows[0]);

        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // Get complete SDR details with location history
    async getCompleteSDRDetails(req, res) {
        try {
            const { promiseSdrPool } = await getPools();
            const { mobile } = req.params;

            const [rows] = await promiseSdrPool.query(`
                SELECT * FROM sdr_records 
                WHERE mobile_number = ?
            `, [mobile]);

            if (rows.length === 0) {
                return res.status(404).json({ error: 'Subscriber not found' });
            }

            const [locations] = await promiseSdrPool.query(`
                SELECT latitude, longitude, location_time, cgi, vlr, request_id
                FROM lbs_tracking 
                WHERE mobile_number = ?
                ORDER BY location_time DESC
                LIMIT 10
            `, [mobile]);

            res.status(200).json({
                success: true,
                subscriber: rows[0],
                location_history: locations
            });

        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // Get location history
    async getLocationHistory(req, res) {
        try {
            const { mobile } = req.params;
            const { days } = req.query;

            const history = await sdrService.getLocationHistory(mobile, days || 7);
            res.status(200).json(history);

        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // Get SDR statistics
    async getStats(req, res) {
        try {
            const { promiseSdrPool } = await getPools();
            const [rows] = await promiseSdrPool.query(`
                SELECT 
                    COUNT(*) as total_subscribers,
                    SUM(CASE WHEN subscriber_status = 'Active' THEN 1 ELSE 0 END) as active_subscribers,
                    COUNT(DISTINCT city) as cities_covered,
                    COUNT(DISTINCT state) as states_covered,
                    (SELECT COUNT(*) FROM lbs_tracking WHERE location_time >= DATE_SUB(NOW(), INTERVAL 24 HOUR)) as locations_today,
                    (SELECT COUNT(*) FROM sdr_imports WHERE import_date >= DATE_SUB(NOW(), INTERVAL 7 DAY)) as imports_week
                FROM sdr_records
            `);

            res.status(200).json(rows[0]);

        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
    // Add these missing methods to sdrController.js

    // Get detailed SDR statistics
    async getDetailedSDRStats(req, res) {
        try {
            const { promiseSdrPool } = await getPools();
            const [stats] = await promiseSdrPool.query(`
            SELECT 
                COUNT(*) as total_subscribers,
                SUM(CASE WHEN subscriber_status = 'Active' THEN 1 ELSE 0 END) as active_subscribers,
                SUM(CASE WHEN subscriber_status = 'Inactive' THEN 1 ELSE 0 END) as inactive_subscribers,
                COUNT(DISTINCT city) as unique_cities,
                COUNT(DISTINCT state) as unique_states,
                SUM(CASE WHEN subscription_type = 'PREPAID' THEN 1 ELSE 0 END) as prepaid_count,
                SUM(CASE WHEN subscription_type = 'POSTPAID' THEN 1 ELSE 0 END) as postpaid_count,
                MIN(activation_date) as oldest_activation,
                MAX(activation_date) as newest_activation
            FROM sdr_records
        `);

            const [topCities] = await promiseSdrPool.query(`
            SELECT city, state, COUNT(*) as count
            FROM sdr_records
            WHERE city IS NOT NULL
            GROUP BY city, state
            ORDER BY count DESC
            LIMIT 5
        `);

            const [recent] = await promiseSdrPool.query(`
            SELECT mobile_number, first_name, last_name, activation_date
            FROM sdr_records
            WHERE activation_date IS NOT NULL
            ORDER BY activation_date DESC
            LIMIT 5
        `);

            res.status(200).json({
                success: true,
                overview: stats[0],
                top_cities: topCities,
                recent_activations: recent
            });

        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // Get recent LBS tracking
    async getRecentLBS(req, res) {
        try {
            const { promiseSdrPool } = await getPools();
            const { limit } = req.query;
            const [rows] = await promiseSdrPool.query(
                `SELECT lt.*, sdr.first_name, sdr.last_name 
             FROM lbs_tracking lt
             LEFT JOIN sdr_records sdr ON lt.sdr_id = sdr.id
             ORDER BY lt.location_time DESC
             LIMIT ?`,
                [parseInt(limit) || 50]
            );

            res.status(200).json({
                success: true,
                count: rows.length,
                data: rows
            });

        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // Get SDR with filters
    async getSDRWithFilters(req, res) {
        try {
            const { promiseSdrPool } = await getPools();
            let sql = `SELECT 
            mobile_number, first_name, last_name, city, state,
            subscriber_status, activation_date, imsi, imei
            FROM sdr_records WHERE 1=1`;
            const params = [];

            const { city, state, status, from_date, to_date } = req.query;

            if (city) {
                sql += ' AND city LIKE ?';
                params.push(`%${city}%`);
            }

            if (state) {
                sql += ' AND state = ?';
                params.push(state);
            }

            if (status) {
                sql += ' AND subscriber_status = ?';
                params.push(status);
            }

            if (from_date) {
                sql += ' AND activation_date >= ?';
                params.push(from_date);
            }

            if (to_date) {
                sql += ' AND activation_date <= ?';
                params.push(to_date);
            }

            sql += ' ORDER BY created_at DESC LIMIT 100';

            const [rows] = await promiseSdrPool.query(sql, params);

            res.status(200).json({
                success: true,
                count: rows.length,
                filters: req.query,
                data: rows
            });

        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // Test insert
    async testInsert(req, res) {
        try {
            const { promiseSdrPool } = await getPools();
            const { records } = req.body;
            const results = [];

            for (const record of records) {
                const [result] = await promiseSdrPool.query(`
                INSERT INTO sdr_records 
                (mobile_number, first_name, last_name, city, state, subscriber_status)
                VALUES (?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                first_name = VALUES(first_name),
                last_name = VALUES(last_name),
                updated_at = CURRENT_TIMESTAMP
            `, [
                    record.mobile_number,
                    record.first_name,
                    record.last_name,
                    record.city,
                    record.state,
                    record.subscriber_status || 'Active'
                ]);

                results.push({
                    mobile: record.mobile_number,
                    result: result
                });
            }

            const [allRecords] = await promiseSdrPool.query(`
            SELECT mobile_number, first_name, last_name, city, state 
            FROM sdr_records 
            LIMIT 10
        `);

            res.status(200).json({
                success: true,
                inserted: results,
                current_data: allRecords
            });

        } catch (error) {
            console.error('Test insert error:', error);
            res.status(500).json({ error: error.message });
        }
    }

    // Test database connection
    async testDb(req, res) {
        try {
            const { promiseSdrPool } = await getPools();
            const [result] = await promiseSdrPool.query('SELECT 1+1 as test');
            res.json({
                success: true,
                message: 'Database connected',
                test: result[0].test
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
    // Lookup SDR details from LBS message
    async lookupSDRFromLBS(req, res) {
        try {
            const { message } = req.body;

            if (!message) {
                return res.status(400).json({
                    success: false,
                    error: 'LBS message is required'
                });
            }

            const result = await sdrService.getSDRDetailsFromLBS(message);

            res.status(200).json(result);

        } catch (error) {
            console.error('LBS Lookup Error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    // Check tables
    async checkTables(req, res) {
        try {
            const { promiseSdrPool } = await getPools();

            const [tables] = await promiseSdrPool.query(`
                SELECT TABLE_NAME 
                FROM INFORMATION_SCHEMA.TABLES 
                WHERE TABLE_SCHEMA = ?
            `, [process.env.SDR_DB_NAME || 'sdr_database']);

            const [count] = await promiseSdrPool.query(`
                SELECT COUNT(*) as total FROM sdr_records
            `);

            const [sample] = await promiseSdrPool.query(`
                SELECT mobile_number, first_name, last_name, city, state 
                FROM sdr_records 
                LIMIT 5
            `);

            res.status(200).json({
                success: true,
                database: process.env.SDR_DB_NAME || 'sdr_database',
                tables: tables.map(t => t.TABLE_NAME),
                sdr_record_count: count[0].total,
                sample_data: sample
            });

        } catch (error) {
            console.error('Check tables error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
}

module.exports = new SDRController();