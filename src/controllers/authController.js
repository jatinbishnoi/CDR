const authService = require('../services/authService');
const { validationResult } = require('express-validator');

class AuthController {
    
    // Login
    async login(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ 
                    success: false, 
                    errors: errors.array() 
                });
            }

            const { identifier, password } = req.body;
            
            // Get device info and IP
            const deviceInfo = req.headers['user-agent'];
            const ipAddress = req.ip || req.connection.remoteAddress;

            const result = await authService.login(identifier, password, deviceInfo, ipAddress);
            
            res.status(200).json({
                success: true,
                message: 'Login successful',
                data: result
            });

        } catch (error) {
            console.error('Login error:', error);
            res.status(401).json({ 
                success: false, 
                error: error.message || 'Login failed' 
            });
        }
    }

    // Logout
    async logout(req, res) {
        try {
            const token = req.header('Authorization')?.replace('Bearer ', '');
            
            if (token) {
                await authService.logout(token);
            }

            res.status(200).json({
                success: true,
                message: 'Logout successful'
            });

        } catch (error) {
            console.error('Logout error:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Logout failed' 
            });
        }
    }

    // Get current user profile
    async getProfile(req, res) {
        try {
            const user = await authService.getUserById(req.user.id);
            
            res.status(200).json({
                success: true,
                data: user
            });

        } catch (error) {
            console.error('Get profile error:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to get profile' 
            });
        }
    }

    // Change password
    async changePassword(req, res) {
        try {
            const { currentPassword, newPassword } = req.body;
            
            // Verify current password (you'll need to add this method)
            // await authService.verifyPassword(req.user.id, currentPassword);
            
            await authService.updateUser(req.user.id, { password: newPassword });
            
            // Logout from all sessions except current
            await authService.logoutAllExcept(req.user.id, req.token);

            res.status(200).json({
                success: true,
                message: 'Password changed successfully'
            });

        } catch (error) {
            console.error('Change password error:', error);
            res.status(500).json({ 
                success: false, 
                error: error.message || 'Failed to change password' 
            });
        }
    }

    // Admin: Create new user
    async createUser(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ 
                    success: false, 
                    errors: errors.array() 
                });
            }

            const userData = req.body;
            const createdBy = req.user.id;

            const newUser = await authService.registerUser(userData, createdBy);

            res.status(201).json({
                success: true,
                message: 'User created successfully',
                data: newUser
            });

        } catch (error) {
            console.error('Create user error:', error);
            res.status(500).json({ 
                success: false, 
                error: error.message || 'Failed to create user' 
            });
        }
    }

    // Admin: Get all users
    async getAllUsers(req, res) {
        try {
            const users = await authService.getAllUsers();
            
            res.status(200).json({
                success: true,
                count: users.length,
                data: users
            });

        } catch (error) {
            console.error('Get users error:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to get users' 
            });
        }
    }

    // Admin: Get user by ID
    async getUserById(req, res) {
        try {
            const { id } = req.params;
            const user = await authService.getUserById(id);
            
            if (!user) {
                return res.status(404).json({ 
                    success: false, 
                    error: 'User not found' 
                });
            }

            res.status(200).json({
                success: true,
                data: user
            });

        } catch (error) {
            console.error('Get user error:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to get user' 
            });
        }
    }

    // Admin: Update user
    async updateUser(req, res) {
        try {
            const { id } = req.params;
            const updateData = req.body;

            // Prevent admins from modifying their own role
            if (id == req.user.id && updateData.role && updateData.role !== req.user.role) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'You cannot change your own role' 
                });
            }

            const updatedUser = await authService.updateUser(id, updateData);

            res.status(200).json({
                success: true,
                message: 'User updated successfully',
                data: updatedUser
            });

        } catch (error) {
            console.error('Update user error:', error);
            res.status(500).json({ 
                success: false, 
                error: error.message || 'Failed to update user' 
            });
        }
    }

    // Admin: Delete user
    async deleteUser(req, res) {
        try {
            const { id } = req.params;

            // Prevent deleting yourself
            if (id == req.user.id) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'You cannot delete your own account' 
                });
            }

            const deleted = await authService.deleteUser(id);

            if (!deleted) {
                return res.status(404).json({ 
                    success: false, 
                    error: 'User not found' 
                });
            }

            res.status(200).json({
                success: true,
                message: 'User deleted successfully'
            });

        } catch (error) {
            console.error('Delete user error:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to delete user' 
            });
        }
    }
}

module.exports = new AuthController();