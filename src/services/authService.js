const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getPools } = require('../config/database');

class AuthService {
    
    constructor() {
        this.pools = null;
        this.JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';
        this.JWT_EXPIRE = process.env.JWT_EXPIRE || '7d';
    }

    async initPools() {
        if (!this.pools) {
            this.pools = await getPools();
        }
        return this.pools;
    }

    // Hash password
    async hashPassword(password) {
        return await bcrypt.hash(password, 10);
    }

    // Compare password
    async comparePassword(password, hash) {
        return await bcrypt.compare(password, hash);
    }

    // Generate JWT token
    generateToken(user) {
        return jwt.sign(
            { 
                id: user.id, 
                username: user.username, 
                role: user.role 
            },
            this.JWT_SECRET,
            { expiresIn: this.JWT_EXPIRE }
        );
    }

    // Verify JWT token
    verifyToken(token) {
        try {
            return jwt.verify(token, this.JWT_SECRET);
        } catch (error) {
            return null;
        }
    }

    // Create initial admin user (run this once)
    async createInitialAdmin() {
        try {
            const { promiseSdrPool } = await this.initPools();
            
            // Check if any admin exists
            const [admins] = await promiseSdrPool.query(
                "SELECT * FROM users WHERE role = 'admin' LIMIT 1"
            );
            
            if (admins.length === 0) {
                const hashedPassword = await this.hashPassword('Admin@123');
                
                await promiseSdrPool.query(
                    `INSERT INTO users 
                    (username, email, password, full_name, role, created_by) 
                    VALUES (?, ?, ?, ?, ?, ?)`,
                    ['admin', 'admin@system.com', hashedPassword, 'System Admin', 'admin', null]
                );
                
                console.log('Initial admin user created successfully');
                console.log('Username: admin');
                console.log('Password: Admin@123');
                console.log('Please change this password after first login!');
            }
        } catch (error) {
            console.error('Error creating initial admin:', error);
        }
    }

    // User registration (admin only)
    async registerUser(userData, createdBy) {
        try {
            const { promiseSdrPool } = await this.initPools();
            
            // Check if user exists
            const [existing] = await promiseSdrPool.query(
                'SELECT id FROM users WHERE username = ? OR email = ?',
                [userData.username, userData.email]
            );
            
            if (existing.length > 0) {
                throw new Error('Username or email already exists');
            }
            
            // Hash password
            const hashedPassword = await this.hashPassword(userData.password);
            
            // Insert user
            const [result] = await promiseSdrPool.query(
                `INSERT INTO users 
                (username, email, password, full_name, role, created_by) 
                VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    userData.username,
                    userData.email,
                    hashedPassword,
                    userData.full_name || userData.username,
                    userData.role || 'viewer',
                    createdBy
                ]
            );
            
            return {
                id: result.insertId,
                username: userData.username,
                email: userData.email,
                role: userData.role || 'viewer'
            };
            
        } catch (error) {
            console.error('Error registering user:', error);
            throw error;
        }
    }

    // User login
    async login(identifier, password, deviceInfo = null, ipAddress = null) {
        try {
            const { promiseSdrPool } = await this.initPools();
            
            // Find user by username or email
            const [users] = await promiseSdrPool.query(
                'SELECT * FROM users WHERE (username = ? OR email = ?) AND is_active = true',
                [identifier, identifier]
            );
            
            if (users.length === 0) {
                throw new Error('Invalid credentials');
            }
            
            const user = users[0];
            
            // Check password
            const isValid = await this.comparePassword(password, user.password);
            if (!isValid) {
                throw new Error('Invalid credentials');
            }
            
            // Generate token
            const token = this.generateToken(user);
            
            // Calculate expiry
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 7); // 7 days from now
            
            // Store session
            await promiseSdrPool.query(
                `INSERT INTO user_sessions 
                (user_id, token, device_info, ip_address, expires_at) 
                VALUES (?, ?, ?, ?, ?)`,
                [user.id, token, deviceInfo, ipAddress, expiresAt]
            );
            
            // Update last login
            await promiseSdrPool.query(
                'UPDATE users SET last_login = NOW() WHERE id = ?',
                [user.id]
            );
            
            // Remove password from response
            delete user.password;
            
            return {
                token,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    full_name: user.full_name,
                    role: user.role
                }
            };
            
        } catch (error) {
            console.error('Error logging in:', error);
            throw error;
        }
    }

    // User logout
    async logout(token) {
        try {
            const { promiseSdrPool } = await this.initPools();
            await promiseSdrPool.query('DELETE FROM user_sessions WHERE token = ?', [token]);
            return true;
        } catch (error) {
            console.error('Error logging out:', error);
            return false;
        }
    }

    // Get user by ID
    async getUserById(userId) {
        try {
            const { promiseSdrPool } = await this.initPools();
            const [users] = await promiseSdrPool.query(
                'SELECT id, username, email, full_name, role, is_active, last_login, created_at FROM users WHERE id = ?',
                [userId]
            );
            return users[0] || null;
        } catch (error) {
            console.error('Error getting user:', error);
            return null;
        }
    }

    // Get all users (admin only)
    async getAllUsers() {
        try {
            const { promiseSdrPool } = await this.initPools();
            const [users] = await promiseSdrPool.query(
                `SELECT u1.id, u1.username, u1.email, u1.full_name, u1.role, 
                        u1.is_active, u1.last_login, u1.created_at,
                        u2.username as created_by_username
                 FROM users u1
                 LEFT JOIN users u2 ON u1.created_by = u2.id
                 ORDER BY u1.created_at DESC`
            );
            return users;
        } catch (error) {
            console.error('Error getting users:', error);
            throw error;
        }
    }

    // Update user (admin only)
    async updateUser(userId, updateData) {
        try {
            const { promiseSdrPool } = await this.initPools();
            
            let query = 'UPDATE users SET ';
            const params = [];
            const updates = [];
            
            if (updateData.full_name) {
                updates.push('full_name = ?');
                params.push(updateData.full_name);
            }
            
            if (updateData.email) {
                updates.push('email = ?');
                params.push(updateData.email);
            }
            
            if (updateData.role) {
                updates.push('role = ?');
                params.push(updateData.role);
            }
            
            if (updateData.is_active !== undefined) {
                updates.push('is_active = ?');
                params.push(updateData.is_active);
            }
            
            if (updateData.password) {
                const hashedPassword = await this.hashPassword(updateData.password);
                updates.push('password = ?');
                params.push(hashedPassword);
            }
            
            if (updates.length === 0) {
                throw new Error('No valid fields to update');
            }
            
            query += updates.join(', ') + ' WHERE id = ?';
            params.push(userId);
            
            await promiseSdrPool.query(query, params);
            
            return await this.getUserById(userId);
            
        } catch (error) {
            console.error('Error updating user:', error);
            throw error;
        }
    }

    // Delete user (admin only)
    async deleteUser(userId) {
        try {
            const { promiseSdrPool } = await this.initPools();
            
            // Delete sessions first
            await promiseSdrPool.query('DELETE FROM user_sessions WHERE user_id = ?', [userId]);
            
            // Delete user
            const [result] = await promiseSdrPool.query('DELETE FROM users WHERE id = ?', [userId]);
            
            return result.affectedRows > 0;
            
        } catch (error) {
            console.error('Error deleting user:', error);
            throw error;
        }
    }

    // Check if user has permission
    async hasPermission(userId, permission) {
        try {
            const { promiseSdrPool } = await this.initPools();
            
            const [users] = await promiseSdrPool.query(
                'SELECT role FROM users WHERE id = ? AND is_active = true',
                [userId]
            );
            
            if (users.length === 0) return false;
            
            const role = users[0].role;
            
            // Admin has all permissions
            if (role === 'admin') return true;
            
            // Check specific permission
            const [perms] = await promiseSdrPool.query(
                'SELECT id FROM role_permissions WHERE role = ? AND permission = ?',
                [role, permission]
            );
            
            return perms.length > 0;
            
        } catch (error) {
            console.error('Error checking permission:', error);
            return false;
        }
    }

    // Validate token and get user
    async validateToken(token) {
        try {
            const decoded = this.verifyToken(token);
            if (!decoded) return null;
            
            const { promiseSdrPool } = await this.initPools();
            
            // Check if session exists and not expired
            const [sessions] = await promiseSdrPool.query(
                'SELECT * FROM user_sessions WHERE token = ? AND expires_at > NOW()',
                [token]
            );
            
            if (sessions.length === 0) return null;
            
            // Get user
            const user = await this.getUserById(decoded.id);
            return user;
            
        } catch (error) {
            console.error('Error validating token:', error);
            return null;
        }
    }
}

module.exports = new AuthService();