const authService = require('../services/authService');

// Authenticate user by token
const authenticate = async (req, res, next) => {
    try {
        console.log('=== AUTHENTICATION DEBUG ===');
        console.log('Headers:', req.headers);
        
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        console.log('Extracted token:', token ? token.substring(0, 20) + '...' : 'No token');
        
        if (!token) {
            console.log('No token provided');
            return res.status(401).json({ 
                success: false, 
                error: 'Authentication required' 
            });
        }

        const user = await authService.validateToken(token);
        
        console.log('Validated user:', user);
        
        if (!user) {
            console.log('Token validation failed');
            return res.status(401).json({ 
                success: false, 
                error: 'Invalid or expired token' 
            });
        }

        req.user = user;
        req.token = token;
        console.log('Authentication successful for user:', user.username, 'Role:', user.role);
        console.log('==========================');
        next();
        
    } catch (error) {
        console.error('Auth middleware error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Authentication failed' 
        });
    }
};

// Authorize based on roles
const authorize = (allowedRoles) => {
    return (req, res, next) => {
        console.log('=== AUTHORIZATION DEBUG ===');
        console.log('Checking authorization...');
        console.log('req.user exists?', req.user ? 'Yes' : 'No');
        
        if (!req.user) {
            console.log('No user found in request');
            return res.status(401).json({ 
                success: false, 
                error: 'Authentication required' 
            });
        }

        console.log('User role:', req.user.role);
        console.log('Allowed roles:', allowedRoles);
        
        // Convert single role to array for consistency
        const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
        
        console.log('User role in allowed roles?', roles.includes(req.user.role));
        
        if (!roles.includes(req.user.role)) {
            console.log('Authorization failed');
            return res.status(403).json({ 
                success: false, 
                error: `Access denied. Required roles: ${roles.join(', ')}. Your role: ${req.user.role}` 
            });
        }

        console.log('Authorization successful');
        console.log('==========================');
        next();
    };
};

module.exports = {
    authenticate,
    authorize
};