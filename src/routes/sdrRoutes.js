const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sdrController = require('../controllers/sdrController');
const { authorize } = require('../middlewares/authMiddleware');
const router = express.Router();

const ADMIN = 'admin';
const ADMIN_DATA_ENTRY = 'data_entry' || 'admin';
const ALL = 'viewer'||'data_entry'||'admin';

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
router.post('/debug-import', authorize(ADMIN_DATA_ENTRY),upload.single('file'), (req, res) => {
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
router.post('/import', 
    authorize(ADMIN_DATA_ENTRY), upload.single('file'), sdrController.importSDR);
// LBS to SDR Lookup
router.post('/lbs/lookup', authorize(ADMIN_DATA_ENTRY), sdrController.lookupSDRFromLBS);
// LBS Components Lookup
router.post('/lbs/lookup-components', authorize(ADMIN_DATA_ENTRY), sdrController.lookupSDRByComponents);
router.get('/search', authorize(ADMIN_DATA_ENTRY), sdrController.searchSDR);
router.get('/all', authorize(ADMIN_DATA_ENTRY), sdrController.getAllSDR);
router.get('/mobile/:mobile', authorize(ADMIN_DATA_ENTRY), sdrController.getByMobile);
router.get('/details/:mobile', authorize(ADMIN_DATA_ENTRY), sdrController.getCompleteSDRDetails);
router.get('/location/:mobile', authorize(ADMIN_DATA_ENTRY), sdrController.getLocationHistory);
router.get('/stats', authorize(ADMIN_DATA_ENTRY), sdrController.getStats);
router.get('/stats/detailed', authorize(ADMIN_DATA_ENTRY), sdrController.getDetailedSDRStats);
router.get('/lbs/recent', authorize(ADMIN_DATA_ENTRY), sdrController.getRecentLBS);
router.get('/check-tables', authorize(ADMIN_DATA_ENTRY), sdrController.checkTables);
router.get('/filter', authorize(ADMIN_DATA_ENTRY), sdrController.getSDRWithFilters);
router.post('/test-insert', authorize(ADMIN_DATA_ENTRY), sdrController.testInsert);
router.get('/test-db', authorize(ADMIN_DATA_ENTRY), sdrController.testDb);

module.exports = router;