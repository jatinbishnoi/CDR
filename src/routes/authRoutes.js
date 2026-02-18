const express = require('express');
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const { authenticate, authorize } = require('../middlewares/authMiddleware');

const router = express.Router();

// Public routes
router.post('/login', [
    body('identifier').notEmpty().withMessage('Username or email is required'),
    body('password').notEmpty().withMessage('Password is required')
], authController.login);

// Protected routes (require authentication)
router.use(authenticate);

// User routes
router.post('/logout', authController.logout);
router.get('/profile', authController.getProfile);
router.post('/change-password', [
    body('currentPassword').notEmpty(),
    body('newPassword').isLength({ min: 6 })
], authController.changePassword);

// Admin only routes
router.post('/users', 
    authorize('admin'),
    [
        body('username').notEmpty().isLength({ min: 3 }),
        body('email').isEmail(),
        body('password').isLength({ min: 6 }),
        body('role').isIn(['admin', 'data_entry', 'viewer'])
    ],
    authController.createUser
);

router.get('/users', 
    authorize('admin'),
    authController.getAllUsers
);

router.get('/users/:id', 
    authorize('admin'),
    authController.getUserById
);

router.put('/users/:id', 
    authorize('admin'),
    authController.updateUser
);

router.delete('/users/:id', 
    authorize('admin'),
    authController.deleteUser
);

module.exports = router;