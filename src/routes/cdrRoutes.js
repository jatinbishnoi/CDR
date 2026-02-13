const express = require('express');
const multer = require('multer');
const path = require('path');
const cdrController = require('../controllers/cdrController');

const router = express.Router();

// Configure multer for file upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, `cdr-${Date.now()}${path.extname(file.originalname)}`);
    }
});

const upload = multer({ 
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/csv' || 
            file.originalname.endsWith('.csv')) {
            cb(null, true);
        } else {
            cb(new Error('Only CSV files are allowed'));
        }
    }
});

// CDR routes
router.post('/upload', upload.single('file'), cdrController.uploadCDR);
router.get('/top-contacts', cdrController.getTopContacts);
router.get('/bottom-contacts', cdrController.getBottomContacts);
router.get('/filtered-contacts', cdrController.getFilteredContacts);
router.get('/relationships', cdrController.getCallRelationships);
router.get('/timeline', cdrController.getCallTimeline);
router.get('/locations', cdrController.getLocationData);
router.get('/summary', cdrController.getSummaryStats);
router.post('/dummy-location', cdrController.addDummyLocationData);

module.exports = router;