const csvService = require('../services/csvService');
const cdrModel = require('../models/cdrModel');

class CDRController {
    // Upload and process CSV file
    async uploadCDR(req, res) {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'No file uploaded' });
            }

            const result = await csvService.processCDRFile(req.file.path);
            res.status(200).json(result);
        } catch (error) {
            console.error('Upload error:', error);
            res.status(500).json({ 
                error: 'Failed to process CDR file', 
                details: error.message 
            });
        }
    }

    // Get top 20 contacts
    async getTopContacts(req, res) {
        try {
            const contacts = await cdrModel.getTopContacts();
            res.status(200).json(contacts);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // Get bottom 20 contacts
    async getBottomContacts(req, res) {
        try {
            const contacts = await cdrModel.getBottomContacts();
            res.status(200).json(contacts);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // Get filtered contacts
    async getFilteredContacts(req, res) {
        try {
            const filters = req.query;
            const contacts = await cdrModel.getFilteredContacts(filters);
            res.status(200).json(contacts);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // Get call relationships
    async getCallRelationships(req, res) {
        try {
            const relationships = await cdrModel.getCallRelationships();
            res.status(200).json(relationships);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // Get call timeline
    async getCallTimeline(req, res) {
        try {
            const days = req.query.days || 30;
            const timeline = await cdrModel.getCallTimeline(days);
            res.status(200).json(timeline);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // Get location data
    async getLocationData(req, res) {
        try {
            const locations = await cdrModel.getLocationData();
            res.status(200).json(locations);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // Get summary statistics
    async getSummaryStats(req, res) {
        try {
            const stats = await cdrModel.getSummaryStats();
            res.status(200).json(stats);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // Add dummy location data for testing
    async addDummyLocationData(req, res) {
        try {
            const { phone_number, lat, lng, location_name } = req.body;
            
            await promisePool.query(
                `UPDATE contacts 
                 SET location_lat = ?, location_lng = ?, location_name = ? 
                 WHERE phone_number = ?`,
                [lat, lng, location_name, phone_number]
            );

            res.status(200).json({ 
                success: true, 
                message: 'Location data added successfully' 
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = new CDRController();