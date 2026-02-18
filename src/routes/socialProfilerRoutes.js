const express = require('express');
const socialProfilerController = require('../controllers/socialProfilerController');
const { authorize } = require('../middlewares/authMiddleware');

const router = express.Router();
const ADMIN = 'admin';
const ADMIN_DATA_ENTRY = 'data_entry' || 'admin';
const ALL = 'viewer'||'data_entry'||'admin';
// Search profiles
router.get('/search', authorize(ADMIN_DATA_ENTRY),socialProfilerController.searchProfile);

// Get profile by mobile number
router.get('/profile/:number', authorize(ADMIN_DATA_ENTRY),socialProfilerController.getProfileByNumber);

// Get profiler statistics
router.get('/stats', authorize(ADMIN_DATA_ENTRY),socialProfilerController.getProfilerStats);

// Test data access
router.get('/test-data', authorize(ADMIN_DATA_ENTRY),socialProfilerController.testDataAccess);

module.exports = router;