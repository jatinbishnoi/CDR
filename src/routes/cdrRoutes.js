const express = require('express');
const multer = require('multer');
const path = require('path');
const cdrController = require('../controllers/cdrController');
const { authorize } = require('../middlewares/authMiddleware');

const router = express.Router();

const ADMIN = 'admin';
const ADMIN_DATA_ENTRY = 'data_entry' || 'admin';
const ALL = 'viewer'||'data_entry'||'admin';

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
router.post('/upload', authorize(ADMIN_DATA_ENTRY),upload.single('file'), cdrController.uploadCDR);
router.get('/top-contacts', authorize(ADMIN_DATA_ENTRY), cdrController.getTopContacts);
router.get('/bottom-contacts', authorize(ADMIN_DATA_ENTRY), cdrController.getBottomContacts);
router.get('/filtered-contacts', authorize(ADMIN_DATA_ENTRY), cdrController.getFilteredContacts);
router.get('/relationships', authorize(ADMIN_DATA_ENTRY), cdrController.getCallRelationships);
router.get('/timeline', authorize(ADMIN_DATA_ENTRY), cdrController.getCallTimeline);
router.get('/locations', authorize(ADMIN_DATA_ENTRY), cdrController.getLocationData);
router.get('/summary', authorize(ADMIN_DATA_ENTRY), cdrController.getSummaryStats);
router.post('/dummy-location', authorize(ADMIN_DATA_ENTRY), cdrController.addDummyLocationData);

module.exports = router;