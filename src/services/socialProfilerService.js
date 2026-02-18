const { getPools } = require('../config/database');

class SocialProfilerService {
    
    constructor() {
        this.pools = null;
    }

    async initPools() {
        if (!this.pools) {
            this.pools = await getPools();
        }
        return this.pools;
    }

    // Normalize mobile number
    normalizeMobileNumber(number) {
        if (!number) return null;
        let cleaned = number.toString().replace(/\D/g, '');
        if (cleaned.length > 10) {
            return cleaned.slice(-10);
        }
        return cleaned;
    }

    // Calculate age from date of birth
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

    // Format date for display
    formatDate(date) {
        if (!date) return null;
        return new Date(date).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    }

    // Get call frequency pattern
    getCallFrequencyPattern(totalCalls, days) {
        if (!totalCalls || !days) return 'Unknown';
        const callsPerDay = totalCalls / days;
        if (callsPerDay > 10) return 'Very High';
        if (callsPerDay > 5) return 'High';
        if (callsPerDay > 2) return 'Medium';
        if (callsPerDay > 0.5) return 'Low';
        return 'Very Low';
    }

    // Get peak calling hours
    async getPeakCallingHours(mobileNumber) {
        const { promiseCdrPool } = await this.initPools();
        
        try {
            const [rows] = await promiseCdrPool.query(
                `SELECT 
                    HOUR(call_time) as hour,
                    COUNT(*) as call_count
                FROM cdr_records 
                WHERE caller_number = ? OR receiver_number = ?
                GROUP BY HOUR(call_time)
                ORDER BY call_count DESC
                LIMIT 3`,
                [mobileNumber, mobileNumber]
            );
            
            return rows.map(r => `${r.hour}:00-${r.hour+1}:00 (${r.call_count} calls)`);
        } catch (error) {
            console.error('Error in getPeakCallingHours:', error);
            return [];
        }
    }

    // Get frequent contacts
    async getFrequentContacts(mobileNumber, limit = 10) {
        const { promiseCdrPool, promiseSdrPool } = await this.initPools();
        
        try {
            const [rows] = await promiseCdrPool.query(
                `SELECT 
                    CASE 
                        WHEN caller_number = ? THEN receiver_number
                        ELSE caller_number
                    END as contact_number,
                    COUNT(*) as call_count,
                    SUM(call_duration) as total_duration,
                    MAX(call_date) as last_call_date
                FROM cdr_records 
                WHERE caller_number = ? OR receiver_number = ?
                GROUP BY contact_number
                ORDER BY call_count DESC
                LIMIT ?`,
                [mobileNumber, mobileNumber, mobileNumber, limit]
            );
            
            // Get SDR details for these contacts
            const contactsWithDetails = [];
            for (const row of rows) {
                const [sdrRows] = await promiseSdrPool.query(
                    `SELECT first_name, last_name, city, state, subscriber_status
                    FROM sdr_records 
                    WHERE mobile_number = ?`,
                    [row.contact_number]
                );
                
                contactsWithDetails.push({
                    mobile_number: row.contact_number,
                    call_count: row.call_count,
                    total_duration_minutes: Math.round((row.total_duration || 0) / 60),
                    last_call: this.formatDate(row.last_call_date),
                    contact_details: sdrRows[0] ? {
                        name: `${sdrRows[0].first_name || ''} ${sdrRows[0].last_name || ''}`.trim(),
                        location: `${sdrRows[0].city || ''}, ${sdrRows[0].state || ''}`.trim(),
                        status: sdrRows[0].subscriber_status
                    } : {
                        name: 'Unknown',
                        location: 'Unknown',
                        status: 'Unknown'
                    }
                });
            }
            
            return contactsWithDetails;
            
        } catch (error) {
            console.error('Error in getFrequentContacts:', error);
            return [];
        }
    }

    // Get SDR summary
    async getSDRSummary(mobileNumber) {
        const { promiseSdrPool } = await this.initPools();
        
        try {
            const [rows] = await promiseSdrPool.query(
                `SELECT 
                    mobile_number, first_name, last_name, city, state,
                    subscriber_status, activation_date, imsi, imei
                FROM sdr_records 
                WHERE mobile_number = ?`,
                [mobileNumber]
            );
            
            return rows[0] || null;
            
        } catch (error) {
            console.error('Error in getSDRSummary:', error);
            return null;
        }
    }

    // Get location history - FIXED VERSION
    async getLocationHistory(mobileNumber, days = 30) {
        const { promiseSdrPool } = await this.initPools();
        
        try {
            // Check which timestamp column exists
            const [columns] = await promiseSdrPool.query(
                `SHOW COLUMNS FROM lbs_tracking LIKE 'received_at'`
            );
            
            let query;
            if (columns.length > 0) {
                query = `
                    SELECT 
                        latitude, longitude, location_time, cgi, vlr, request_id,
                        received_at as tracked_at
                    FROM lbs_tracking 
                    WHERE mobile_number = ? 
                        AND location_time >= DATE_SUB(NOW(), INTERVAL ? DAY)
                    ORDER BY location_time DESC
                `;
            } else {
                query = `
                    SELECT 
                        latitude, longitude, location_time, cgi, vlr, request_id
                    FROM lbs_tracking 
                    WHERE mobile_number = ? 
                        AND location_time >= DATE_SUB(NOW(), INTERVAL ? DAY)
                    ORDER BY location_time DESC
                `;
            }
            
            const [rows] = await promiseSdrPool.query(query, [mobileNumber, days]);
            
            return rows.map(loc => ({
                latitude: loc.latitude,
                longitude: loc.longitude,
                time: loc.location_time,
                map_url: loc.latitude && loc.longitude ? 
                    `https://maps.google.com/maps?q=${loc.latitude},${loc.longitude}` : null,
                network: {
                    cgi: loc.cgi,
                    vlr: loc.vlr
                }
            }));
            
        } catch (error) {
            console.error('Error in getLocationHistory:', error);
            return [];
        }
    }

    // Get call timeline
    async getCallTimeline(mobileNumber, days = 30) {
        const { promiseCdrPool } = await this.initPools();
        
        try {
            const [rows] = await promiseCdrPool.query(
                `SELECT 
                    DATE(call_date) as date,
                    COUNT(*) as total_calls,
                    SUM(CASE WHEN caller_number = ? THEN 1 ELSE 0 END) as outgoing_calls,
                    SUM(CASE WHEN receiver_number = ? THEN 1 ELSE 0 END) as incoming_calls,
                    SUM(call_duration) as total_duration,
                    AVG(call_duration) as avg_duration
                FROM cdr_records 
                WHERE (caller_number = ? OR receiver_number = ?)
                    AND call_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
                GROUP BY DATE(call_date)
                ORDER BY date DESC`,
                [mobileNumber, mobileNumber, mobileNumber, mobileNumber, days]
            );
            
            return rows.map(call => ({
                date: call.date,
                total_calls: call.total_calls,
                outgoing: call.outgoing_calls,
                incoming: call.incoming_calls,
                total_duration_minutes: Math.round((call.total_duration || 0) / 60),
                avg_duration_seconds: Math.round(call.avg_duration || 0)
            }));
            
        } catch (error) {
            console.error('Error in getCallTimeline:', error);
            return [];
        }
    }

    // Get call statistics - FIXED VERSION
    async getCallStatistics(mobileNumber) {
        const { promiseCdrPool } = await this.initPools();
        
        try {
            const [rows] = await promiseCdrPool.query(
                `SELECT 
                    COUNT(*) as total_calls,
                    SUM(CASE WHEN caller_number = ? THEN 1 ELSE 0 END) as total_outgoing,
                    SUM(CASE WHEN receiver_number = ? THEN 1 ELSE 0 END) as total_incoming,
                    COALESCE(SUM(call_duration), 0) as total_duration,
                    COALESCE(AVG(call_duration), 0) as avg_duration,
                    COALESCE(MAX(call_duration), 0) as max_duration,
                    COALESCE(MIN(call_duration), 0) as min_duration,
                    COUNT(DISTINCT CASE WHEN caller_number = ? THEN receiver_number ELSE caller_number END) as unique_contacts,
                    MIN(call_date) as first_call_date,
                    MAX(call_date) as last_call_date
                FROM cdr_records 
                WHERE caller_number = ? OR receiver_number = ?`,
                [mobileNumber, mobileNumber, mobileNumber, mobileNumber, mobileNumber]
            );
            
            const stats = rows[0] || {
                total_calls: 0,
                total_outgoing: 0,
                total_incoming: 0,
                total_duration: 0,
                avg_duration: 0,
                max_duration: 0,
                min_duration: 0,
                unique_contacts: 0,
                first_call_date: null,
                last_call_date: null
            };
            
            // Calculate days between first and last call
            let daysActive = 30;
            if (stats.first_call_date && stats.last_call_date) {
                const start = new Date(stats.first_call_date);
                const end = new Date(stats.last_call_date);
                daysActive = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
            }
            
            return {
                ...stats,
                total_duration_minutes: Math.round(stats.total_duration / 60),
                avg_duration_seconds: Math.round(stats.avg_duration),
                call_frequency: this.getCallFrequencyPattern(stats.total_calls, daysActive)
            };
            
        } catch (error) {
            console.error('Error in getCallStatistics:', error);
            return null;
        }
    }

    // Main profiler function
    async getSocialProfile(searchQuery) {
        try {
            console.log('Searching social profile for:', searchQuery);
            
            const { promiseSdrPool, promiseCdrPool } = await this.initPools();
            
            // Normalize search
            const searchTerm = searchQuery.toString().trim();
            const isNumber = /^\d+$/.test(searchTerm.replace(/\D/g, ''));
            
            let sdrResults = [];
            
            // Search in SDR database
            if (isNumber) {
                const normalizedNumber = this.normalizeMobileNumber(searchTerm);
                
                // Search by mobile number
                const [sdrRows] = await promiseSdrPool.query(
                    `SELECT * FROM sdr_records 
                     WHERE mobile_number LIKE ? OR imsi LIKE ? OR imei LIKE ?`,
                    [`%${normalizedNumber}%`, `%${searchTerm}%`, `%${searchTerm}%`]
                );
                sdrResults = sdrRows;
                
            } else {
                // Search by name
                const [sdrRows] = await promiseSdrPool.query(
                    `SELECT * FROM sdr_records 
                     WHERE first_name LIKE ? OR last_name LIKE ? 
                     OR CONCAT(first_name, ' ', last_name) LIKE ?`,
                    [`%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`]
                );
                sdrResults = sdrRows;
            }
            
            console.log(`Found ${sdrResults.length} SDR records`);
            
            // If SDR records found, get related CDR and LBS data
            const profiles = [];
            
            for (const sdr of sdrResults) {
                // Get CDR statistics
                const cdrStats = await this.getCallStatistics(sdr.mobile_number);
                
                // Get call timeline
                const timeline = await this.getCallTimeline(sdr.mobile_number, 30);
                
                // Get location history
                const locations = await this.getLocationHistory(sdr.mobile_number, 30);
                
                // Get frequent contacts
                const frequentContacts = await this.getFrequentContacts(sdr.mobile_number, 5);
                
                // Get peak calling hours
                const peakHours = await this.getPeakCallingHours(sdr.mobile_number);
                
                // Calculate days since activation
                const daysActive = sdr.activation_date ? 
                    Math.floor((new Date() - new Date(sdr.activation_date)) / (1000 * 60 * 60 * 24)) : null;
                
                // Build complete profile
                const profile = {
                    // Subscriber Information
                    subscriber: {
                        mobile_number: sdr.mobile_number,
                        full_name: `${sdr.first_name || ''} ${sdr.last_name || ''}`.trim(),
                        first_name: sdr.first_name,
                        last_name: sdr.last_name,
                        father_name: sdr.father_name,
                        spouse_name: sdr.spouse_name,
                        gender: sdr.gender === 'M' ? 'Male' : sdr.gender === 'F' ? 'Female' : sdr.gender,
                        date_of_birth: this.formatDate(sdr.date_of_birth),
                        age: this.calculateAge(sdr.date_of_birth),
                        nationality: sdr.nationality,
                        alternate_contact: sdr.alternate_contact,
                        
                        // Address
                        address: {
                            current: sdr.address,
                            permanent: sdr.permanent_address,
                            city: sdr.city,
                            district: sdr.district,
                            state: sdr.state,
                            pin_code: sdr.pin_code,
                            full_address: [sdr.address, sdr.city, sdr.state, sdr.pin_code]
                                .filter(Boolean).join(', ')
                        },
                        
                        // Identity
                        identification: {
                            type: sdr.id_type,
                            number: sdr.id_number ? 
                                sdr.id_number.substring(0, 4) + 'XXXXXXXX' + sdr.id_number.slice(-4) : null
                        },
                        
                        // Subscription
                        subscription: {
                            type: sdr.subscription_type,
                            status: sdr.subscriber_status,
                            activation_date: this.formatDate(sdr.activation_date),
                            days_active: daysActive,
                            circle: sdr.circle_code,
                            sim_type: sdr.sim_type
                        },
                        
                        // SIM Details
                        sim: {
                            imsi: sdr.imsi,
                            imei: sdr.imei
                        }
                    },
                    
                    // Call Activity Summary
                    call_activity: cdrStats ? {
                        total_calls: cdrStats.total_calls || 0,
                        outgoing_calls: cdrStats.total_outgoing || 0,
                        incoming_calls: cdrStats.total_incoming || 0,
                        total_duration_minutes: cdrStats.total_duration_minutes || 0,
                        average_duration_seconds: cdrStats.avg_duration_seconds || 0,
                        max_duration_seconds: cdrStats.max_duration || 0,
                        min_duration_seconds: cdrStats.min_duration || 0,
                        unique_contacts: cdrStats.unique_contacts || 0,
                        first_call: this.formatDate(cdrStats.first_call_date),
                        last_call: this.formatDate(cdrStats.last_call_date),
                        call_frequency: cdrStats.call_frequency || 'Unknown',
                        peak_hours: peakHours
                    } : {
                        total_calls: 0,
                        message: 'No CDR data found for this subscriber'
                    },
                    
                    // Recent Call Timeline
                    recent_calls: timeline.slice(0, 10),
                    
                    // Frequent Contacts
                    frequent_contacts: frequentContacts,
                    
                    // Location History
                    location_history: locations,
                    
                    // Social Graph Summary
                    social_graph: {
                        total_contacts: cdrStats?.unique_contacts || 0,
                        top_contact: frequentContacts[0] ? {
                            number: frequentContacts[0].mobile_number,
                            calls: frequentContacts[0].call_count,
                            name: frequentContacts[0].contact_details?.name || 'Unknown'
                        } : null,
                        call_ratio: cdrStats ? 
                            `${Math.round((cdrStats.total_outgoing || 0) / (cdrStats.total_calls || 1) * 100)}% outgoing, ${Math.round((cdrStats.total_incoming || 0) / (cdrStats.total_calls || 1) * 100)}% incoming` : null
                    },
                    
                    // Profile Summary
                    summary: {
                        profile_completeness: this.calculateProfileCompleteness(sdr),
                        last_updated: sdr.updated_at,
                        data_sources: {
                            sdr: true,
                            cdr: cdrStats ? cdrStats.total_calls > 0 : false,
                            lbs: locations.length > 0
                        }
                    }
                };
                
                profiles.push(profile);
            }
            
            // If no SDR results, try searching CDR only
            if (profiles.length === 0 && isNumber) {
                const normalizedNumber = this.normalizeMobileNumber(searchTerm);
                
                const [cdrCallers] = await promiseCdrPool.query(
                    `SELECT DISTINCT caller_number as number 
                     FROM cdr_records 
                     WHERE caller_number LIKE ? OR receiver_number LIKE ?
                     LIMIT 10`,
                    [`%${normalizedNumber}%`, `%${normalizedNumber}%`]
                );
                
                for (const row of cdrCallers) {
                    const cdrStats = await this.getCallStatistics(row.number);
                    const frequentContacts = await this.getFrequentContacts(row.number, 3);
                    
                    profiles.push({
                        subscriber: {
                            mobile_number: row.number,
                            full_name: 'Unknown (Not in SDR database)',
                            address: null,
                            subscription: null
                        },
                        call_activity: cdrStats ? {
                            total_calls: cdrStats.total_calls || 0,
                            outgoing_calls: cdrStats.total_outgoing || 0,
                            incoming_calls: cdrStats.total_incoming || 0,
                            unique_contacts: cdrStats.unique_contacts || 0,
                            first_call: this.formatDate(cdrStats.first_call_date),
                            last_call: this.formatDate(cdrStats.last_call_date)
                        } : null,
                        frequent_contacts: frequentContacts,
                        summary: {
                            data_sources: {
                                sdr: false,
                                cdr: true,
                                lbs: false
                            }
                        }
                    });
                }
            }
            
            return {
                success: true,
                query: searchQuery,
                timestamp: new Date().toISOString(),
                total_results: profiles.length,
                profiles: profiles,
                search_type: isNumber ? 'number' : 'name'
            };
            
        } catch (error) {
            console.error('Error in social profiler:', error);
            throw error;
        }
    }

    // Calculate profile completeness percentage
    calculateProfileCompleteness(sdr) {
        if (!sdr) return 0;
        
        const fields = [
            'first_name', 'last_name', 'father_name', 'gender', 'date_of_birth',
            'nationality', 'alternate_contact', 'address', 'city',
            'state', 'pin_code', 'id_type', 'id_number', 'imsi', 'imei'
        ];
        
        const filledFields = fields.filter(f => sdr[f] && sdr[f] !== 'None' && sdr[f] !== '');
        return Math.round((filledFields.length / fields.length) * 100);
    }
}

module.exports = new SocialProfilerService();