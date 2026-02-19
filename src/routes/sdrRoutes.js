const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sdrController = require('../controllers/sdrController');
const { authenticate, authorize } = require('../middlewares/authMiddleware');

const router = express.Router();

// Define roles properly
const ROLES = {
    ADMIN: 'admin',
    DATA_ENTRY: 'data_entry' || 'admin',
    VIEWER: 'viewer' || 'data_entry' || 'admin',
};

// Role combinations
const ADMIN_ONLY = [ROLES.ADMIN];
const DATA_ENTRY_ADMIN = [ROLES.ADMIN, ROLES.DATA_ENTRY];
const ALL_ROLES = [ROLES.ADMIN, ROLES.DATA_ENTRY, ROLES.VIEWER];

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

// Apply authentication to all routes
router.use(authenticate);

// Debug route
router.post('/debug-import', authorize(DATA_ENTRY_ADMIN), upload.single('file'), (req, res) => {
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

// LBS Processing - accessible by admin and data entry
router.post('/lbs/process', authorize(DATA_ENTRY_ADMIN), sdrController.processLBS);

// SDR Management
router.post('/import', 
    authorize(ADMIN_ONLY), 
    upload.single('file'), 
    sdrController.importSDR
);

// LBS to SDR Lookup
router.post('/lbs/lookup', 
    authorize(DATA_ENTRY_ADMIN), 
    sdrController.lookupSDRFromLBS
);

// LBS Components Lookup
router.post('/lbs/lookup-components', 
    authorize(DATA_ENTRY_ADMIN), 
    sdrController.lookupSDRByComponents
);

// Search routes - accessible by all authenticated users
router.get('/search', authorize(ALL_ROLES), sdrController.searchSDR);
router.get('/all', authorize(ALL_ROLES), sdrController.getAllSDR);
router.get('/mobile/:mobile', authorize(ALL_ROLES), sdrController.getByMobile);
router.get('/details/:mobile', authorize(ALL_ROLES), sdrController.getCompleteSDRDetails);
router.get('/location/:mobile', authorize(ALL_ROLES), sdrController.getLocationHistory);
router.get('/stats', authorize(ALL_ROLES), sdrController.getStats);
router.get('/stats/detailed', authorize(ALL_ROLES), sdrController.getDetailedSDRStats);
router.get('/lbs/recent', authorize(ALL_ROLES), sdrController.getRecentLBS);
router.get('/check-tables', authorize(ALL_ROLES), sdrController.checkTables);
router.get('/filter', authorize(ALL_ROLES), sdrController.getSDRWithFilters);

// Test routes - admin only
router.post('/test-insert', authorize(ADMIN_ONLY), sdrController.testInsert);
router.get('/test-db', authorize(ALL_ROLES), sdrController.testDb);

module.exports = router;