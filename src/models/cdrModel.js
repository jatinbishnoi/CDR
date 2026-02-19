const { getPools } = require('../config/database');

class CDRModel {
    
    constructor() {
        this.pools = null;
    }

    async initPools() {
        if (!this.pools) {
            this.pools = await getPools();
        }
        return this.pools;
    }

    // Get top 20 contacts by number of calls
    async getTopContacts(limit = 20) {
        try {
            const { promiseCdrPool } = await this.initPools();
            const [rows] = await promiseCdrPool.query(
                `SELECT * FROM contacts 
                 ORDER BY total_calls DESC 
                 LIMIT ?`,
                [limit]
            );
            return rows;
        } catch (error) {
            console.error('Error in getTopContacts:', error);
            throw error;
        }
    }

    // Get bottom 20 contacts by number of calls
    async getBottomContacts(limit = 20) {
        try {
            const { promiseCdrPool } = await this.initPools();
            const [rows] = await promiseCdrPool.query(
                `SELECT * FROM contacts 
                 WHERE total_calls > 0 
                 ORDER BY total_calls ASC 
                 LIMIT ?`,
                [limit]
            );
            return rows;
        } catch (error) {
            console.error('Error in getBottomContacts:', error);
            throw error;
        }
    }

    // Get filtered contacts
    async getFilteredContacts(filters) {
        try {
            const { promiseCdrPool } = await this.initPools();
            let query = 'SELECT * FROM contacts WHERE 1=1';
            const params = [];

            if (filters.name) {
                query += ' AND name LIKE ?';
                params.push(`%${filters.name}%`);
            }

            if (filters.phone_number) {
                query += ' AND phone_number LIKE ?';
                params.push(`%${filters.phone_number}%`);
            }

            if (filters.min_calls) {
                query += ' AND total_calls >= ?';
                params.push(filters.min_calls);
            }

            if (filters.max_calls) {
                query += ' AND total_calls <= ?';
                params.push(filters.max_calls);
            }

            if (filters.from_date) {
                query += ' AND last_call_date >= ?';
                params.push(filters.from_date);
            }

            if (filters.to_date) {
                query += ' AND last_call_date <= ?';
                params.push(filters.to_date);
            }

            query += ' ORDER BY total_calls DESC';

            const [rows] = await promiseCdrPool.query(query, params);
            return rows;
        } catch (error) {
            console.error('Error in getFilteredContacts:', error);
            throw error;
        }
    }

    // Get call relationships
    async getCallRelationships(limit = 50) {
        try {
            const { promiseCdrPool } = await this.initPools();
            const [rows] = await promiseCdrPool.query(
                `SELECT cr.*, 
                        c1.name as caller_name,
                        c2.name as receiver_name
                 FROM call_relationships cr
                 LEFT JOIN contacts c1 ON cr.caller_number = c1.phone_number
                 LEFT JOIN contacts c2 ON cr.receiver_number = c2.phone_number
                 ORDER BY cr.call_count DESC
                 LIMIT ?`,
                [limit]
            );
            return rows;
        } catch (error) {
            console.error('Error in getCallRelationships:', error);
            throw error;
        }
    }

    // Get call timeline data
    async getCallTimeline(days = 30) {
        try {
            const { promiseCdrPool } = await this.initPools();
            const [rows] = await promiseCdrPool.query(
                `SELECT DATE(call_date) as date, 
                        COUNT(*) as total_calls,
                        SUM(call_duration) as total_duration,
                        COUNT(DISTINCT caller_number) as unique_callers
                 FROM cdr_records
                 WHERE call_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
                 GROUP BY DATE(call_date)
                 ORDER BY date DESC`,
                [days]
            );
            return rows;
        } catch (error) {
            console.error('Error in getCallTimeline:', error);
            throw error;
        }
    }

    // Get location data for map
    async getLocationData() {
        try {
            const { promiseCdrPool } = await this.initPools();
            const [rows] = await promiseCdrPool.query(
                `SELECT location_lat, location_lng, location_name, 
                        caller_number, receiver_number, call_date, call_time
                 FROM cdr_records
                 WHERE location_lat IS NOT NULL 
                   AND location_lng IS NOT NULL
                 ORDER BY call_date DESC, call_time DESC
                 LIMIT 100`
            );
            return rows;
        } catch (error) {
            console.error('Error in getLocationData:', error);
            throw error;
        }
    }

    // Get summary statistics
    async getSummaryStats() {
        try {
            const { promiseCdrPool } = await this.initPools();
            const [rows] = await promiseCdrPool.query(
                `SELECT 
                    (SELECT COUNT(*) FROM cdr_records) as total_calls,
                    (SELECT COUNT(DISTINCT caller_number) FROM cdr_records) as total_callers,
                    (SELECT COUNT(DISTINCT receiver_number) FROM cdr_records) as total_receivers,
                    (SELECT SUM(call_duration) FROM cdr_records) as total_duration,
                    (SELECT AVG(call_duration) FROM cdr_records) as avg_duration,
                    (SELECT COUNT(*) FROM cdr_records WHERE call_type = 'missed') as missed_calls,
                    (SELECT COUNT(*) FROM contacts) as total_contacts
                FROM dual`
            );
            return rows[0];
        } catch (error) {
            console.error('Error in getSummaryStats:', error);
            throw error;
        }
    }

    // Get contacts by date range
    async getContactsByDateRange(fromDate, toDate) {
        try {
            const { promiseCdrPool } = await this.initPools();
            const [rows] = await promiseCdrPool.query(
                `SELECT DISTINCT 
                    CASE 
                        WHEN caller_number IN (SELECT phone_number FROM contacts) THEN caller_number
                        ELSE receiver_number
                    END as phone_number
                FROM cdr_records 
                WHERE call_date BETWEEN ? AND ?`,
                [fromDate, toDate]
            );
            return rows;
        } catch (error) {
            console.error('Error in getContactsByDateRange:', error);
            throw error;
        }
    }

    // Get call details for a specific number
    async getCallDetailsByNumber(phoneNumber, limit = 50) {
        try {
            const { promiseCdrPool } = await this.initPools();
            const [rows] = await promiseCdrPool.query(
                `SELECT * FROM cdr_records 
                 WHERE caller_number = ? OR receiver_number = ?
                 ORDER BY call_date DESC, call_time DESC
                 LIMIT ?`,
                [phoneNumber, phoneNumber, limit]
            );
            return rows;
        } catch (error) {
            console.error('Error in getCallDetailsByNumber:', error);
            throw error;
        }
    }
}

module.exports = new CDRModel();