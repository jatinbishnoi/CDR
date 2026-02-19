const express = require('express');
const multer = require('multer');
const path = require('path');
const cdrController = require('../controllers/cdrController');
const { authenticate, authorize } = require('../middlewares/authMiddleware');

const router = express.Router();

// Define roles properly
const ROLES = {
    ADMIN: 'admin',
    DATA_ENTRY: 'data_entry',
    VIEWER: 'viewer'
};

// Role combinations - FIXED: Use arrays, not string concatenation with ||
const ADMIN_ONLY = [ROLES.ADMIN];
const DATA_ENTRY_ADMIN = [ROLES.ADMIN, ROLES.DATA_ENTRY];
const ALL_ROLES = [ROLES.ADMIN, ROLES.DATA_ENTRY, ROLES.VIEWER];

console.log('CDR Routes - Role constants loaded:', { 
    ADMIN_ONLY, 
    DATA_ENTRY_ADMIN, 
    ALL_ROLES 
});

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

// Apply authentication to all routes
router.use(authenticate);

// Debug middleware to log user for CDR routes
router.use((req, res, next) => {
    console.log(`📞 CDR Route accessed: ${req.method} ${req.path}`);
    console.log('👤 User from auth:', req.user ? { 
        id: req.user.id, 
        username: req.user.username, 
        role: req.user.role 
    } : 'No user');
    next();
});

// CDR routes with proper role-based access

// Data import routes - Admin and Data Entry only
router.post('/upload', 
    authorize(DATA_ENTRY_ADMIN), 
    upload.single('file'), 
    cdrController.uploadCDR
);

router.post('/dummy-location', 
    authorize(DATA_ENTRY_ADMIN), 
    cdrController.addDummyLocationData
);

// Data view routes - All authenticated users (Admin, Data Entry, Viewer)
router.get('/top-contacts', 
    authorize(ALL_ROLES), 
    cdrController.getTopContacts
);

router.get('/bottom-contacts', 
    authorize(ALL_ROLES), 
    cdrController.getBottomContacts
);

router.get('/filtered-contacts', 
    authorize(ALL_ROLES), 
    cdrController.getFilteredContacts
);

router.get('/relationships', 
    authorize(ALL_ROLES), 
    cdrController.getCallRelationships
);

router.get('/timeline', 
    authorize(ALL_ROLES), 
    cdrController.getCallTimeline
);

router.get('/locations', 
    authorize(ALL_ROLES), 
    cdrController.getLocationData
);

router.get('/summary', 
    authorize(ALL_ROLES), 
    cdrController.getSummaryStats
);

// Optional: Add a test endpoint to verify CDR auth is working
router.get('/test-auth', 
    authorize(ALL_ROLES), 
    (req, res) => {
        res.json({
            success: true,
            message: 'CDR authentication working!',
            user: {
                id: req.user.id,
                username: req.user.username,
                role: req.user.role
            }
        });
    }
);

// Admin only routes (if any specific to CDR)
// Example: router.delete('/delete-all', authorize(ADMIN_ONLY), cdrController.deleteAllData);

module.exports = router;