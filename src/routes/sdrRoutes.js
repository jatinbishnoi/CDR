const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sdrController = require('../controllers/sdrController');

const router = express.Router();

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '../uploads/sdr');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log('Created upload directory:', uploadDir);
}

// Configure multer for SDR import
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, `sdr-${Date.now()}${path.extname(file.originalname)}`);
    }
});

const upload = multer({ 
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
            cb(null, true);
        } else {
            cb(new Error('Only CSV files are allowed'));
        }
    },
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

// Debug route - make sure this controller method exists
router.post('/debug-import', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        res.json({
            success: true,
            filename: req.file.originalname,
            path: req.file.path,
            size: req.file.size
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// LBS Processing
router.post('/lbs/process', sdrController.processLBS);

// SDR Management
router.post('/import', upload.single('file'), sdrController.importSDR);
// LBS to SDR Lookup
router.post('/lbs/lookup', sdrController.lookupSDRFromLBS);
// LBS Components Lookup
router.post('/lbs/lookup-components', sdrController.lookupSDRByComponents);
router.get('/search', sdrController.searchSDR);
router.get('/all', sdrController.getAllSDR);
router.get('/mobile/:mobile', sdrController.getByMobile);
router.get('/details/:mobile', sdrController.getCompleteSDRDetails);
router.get('/location/:mobile', sdrController.getLocationHistory);
router.get('/stats', sdrController.getStats);
router.get('/stats/detailed', sdrController.getDetailedSDRStats);
router.get('/lbs/recent', sdrController.getRecentLBS);
router.get('/check-tables', sdrController.checkTables);
router.get('/filter', sdrController.getSDRWithFilters);
router.post('/test-insert', sdrController.testInsert);
router.get('/test-db', sdrController.testDb);

module.exports = router;