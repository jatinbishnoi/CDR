const express = require('express');
const socialProfilerController = require('../controllers/socialProfilerController');

const router = express.Router();

// Search profiles
router.get('/search', socialProfilerController.searchProfile);

// Get profile by mobile number
router.get('/profile/:number', socialProfilerController.getProfileByNumber);

// Get profiler statistics
router.get('/stats', socialProfilerController.getProfilerStats);

// Test data access
router.get('/test-data', socialProfilerController.testDataAccess);

module.exports = router;