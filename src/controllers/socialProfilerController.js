const socialProfilerService = require('../services/socialProfilerService');

class SocialProfilerController {
    
    // Search social profile by name or number
    async searchProfile(req, res) {
        try {
            const { query } = req.query;
            
            if (!query) {
                return res.status(400).json({
                    success: false,
                    error: 'Search query is required'
                });
            }

            // Use getSocialProfile directly (not searchProfiles)
            const results = await socialProfilerService.getSocialProfile(query);
            
            res.status(200).json(results);

        } catch (error) {
            console.error('Social Profiler Error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    // Get detailed profile by mobile number
    async getProfileByNumber(req, res) {
        try {
            const { number } = req.params;
            
            if (!number) {
                return res.status(400).json({
                    success: false,
                    error: 'Mobile number is required'
                });
            }

            const results = await socialProfilerService.getSocialProfile(number);
            
            if (results.profiles.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'No profile found with this number'
                });
            }

            res.status(200).json(results.profiles[0]);

        } catch (error) {
            console.error('Profile by number error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    // Get profiler statistics
    async getProfilerStats(req, res) {
        try {
            const { promiseSdrPool, promiseCdrPool } = await socialProfilerService.initPools();
            
            // Get SDR stats
            const [sdrStats] = await promiseSdrPool.query(`
                SELECT 
                    COUNT(*) as total_subscribers,
                    SUM(CASE WHEN subscriber_status = 'Active' THEN 1 ELSE 0 END) as active_subscribers,
                    COUNT(DISTINCT city) as cities_covered
                FROM sdr_records
            `);
            
            // Get CDR stats
            const [cdrStats] = await promiseCdrPool.query(`
                SELECT 
                    COUNT(DISTINCT caller_number) as unique_callers,
                    COUNT(DISTINCT receiver_number) as unique_receivers,
                    COUNT(*) as total_calls,
                    MIN(call_date) as oldest_call,
                    MAX(call_date) as latest_call
                FROM cdr_records
            `);
            
            // Get LBS stats
            const [lbsStats] = await promiseSdrPool.query(`
                SELECT 
                    COUNT(DISTINCT mobile_number) as tracked_subscribers,
                    COUNT(*) as total_locations,
                    MIN(location_time) as oldest_location,
                    MAX(location_time) as latest_location
                FROM lbs_tracking
            `);
            
            res.status(200).json({
                success: true,
                timestamp: new Date().toISOString(),
                stats: {
                    subscribers: {
                        total: sdrStats[0]?.total_subscribers || 0,
                        active: sdrStats[0]?.active_subscribers || 0,
                        cities: sdrStats[0]?.cities_covered || 0
                    },
                    calls: {
                        total: cdrStats[0]?.total_calls || 0,
                        unique_callers: cdrStats[0]?.unique_callers || 0,
                        unique_receivers: cdrStats[0]?.unique_receivers || 0,
                        date_range: {
                            from: cdrStats[0]?.oldest_call,
                            to: cdrStats[0]?.latest_call
                        }
                    },
                    locations: {
                        tracked_subscribers: lbsStats[0]?.tracked_subscribers || 0,
                        total_locations: lbsStats[0]?.total_locations || 0,
                        date_range: {
                            from: lbsStats[0]?.oldest_location,
                            to: lbsStats[0]?.latest_location
                        }
                    }
                }
            });

        } catch (error) {
            console.error('Profiler stats error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    // Test data access
    async testDataAccess(req, res) {
        try {
            const { promiseSdrPool, promiseCdrPool } = await socialProfilerService.initPools();
            
            // Test SDR access
            const [sdrRows] = await promiseSdrPool.query(
                'SELECT mobile_number, first_name, last_name FROM sdr_records LIMIT 5'
            );
            
            // Test CDR access
            const [cdrRows] = await promiseCdrPool.query(
                'SELECT caller_number, COUNT(*) as count FROM cdr_records GROUP BY caller_number LIMIT 5'
            );
            
            res.json({
                success: true,
                sdr_data: sdrRows,
                cdr_data: cdrRows
            });
            
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
                sqlMessage: error.sqlMessage
            });
        }
    }
}

module.exports = new SocialProfilerController();