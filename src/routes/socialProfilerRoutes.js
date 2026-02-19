const express = require('express');
const socialProfilerController = require('../controllers/socialProfilerController');
const { authenticate, authorize } = require('../middlewares/authMiddleware');

const router = express.Router();

// Define roles properly - FIXED: Use arrays, not string concatenation with ||
const ROLES = {
    ADMIN: 'admin',
    DATA_ENTRY: 'data_entry',
    VIEWER: 'viewer'
};

// Role combinations - FIXED: Proper arrays
const ADMIN_ONLY = [ROLES.ADMIN];
const ADMIN_DATA_ENTRY = [ROLES.ADMIN, ROLES.DATA_ENTRY];  // FIXED: This was incorrect before
const ALL_ROLES = [ROLES.ADMIN, ROLES.DATA_ENTRY, ROLES.VIEWER];  // FIXED: This was incorrect before

// Apply authentication to all routes
router.use(authenticate);

// Debug middleware to log access (optional, can be removed)
router.use((req, res, next) => {
    console.log(`📊 Social Profiler: ${req.method} ${req.path} - User: ${req.user?.username} (${req.user?.role})`);
    next();
});

// Search profiles - accessible by Admin and Data Entry
router.get('/search', 
    authorize(ADMIN_DATA_ENTRY), 
    socialProfilerController.searchProfile
);

// Get profile by mobile number - accessible by Admin and Data Entry
router.get('/profile/:number', 
    authorize(ADMIN_DATA_ENTRY), 
    socialProfilerController.getProfileByNumber
);

// Get profiler statistics - accessible by Admin and Data Entry
router.get('/stats', 
    authorize(ADMIN_DATA_ENTRY), 
    socialProfilerController.getProfilerStats
);

// Test data access - accessible by Admin and Data Entry
router.get('/test-data', 
    authorize(ADMIN_DATA_ENTRY), 
    socialProfilerController.testDataAccess
);

module.exports = router;