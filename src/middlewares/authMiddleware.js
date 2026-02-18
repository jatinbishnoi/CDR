const authService = require('../services/authService');

// Authenticate user by token
const authenticate = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ 
                success: false, 
                error: 'Authentication required' 
            });
        }

        const user = await authService.validateToken(token);
        
        if (!user) {
            return res.status(401).json({ 
                success: false, 
                error: 'Invalid or expired token' 
            });
        }

        req.user = user;
        req.token = token;
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
const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ 
                success: false, 
                error: 'Authentication required' 
            });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ 
                success: false, 
                error: 'You do not have permission to access this resource' 
            });
        }

        next();
    };
};

// Check specific permission
const hasPermission = (permission) => {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                return res.status(401).json({ 
                    success: false, 
                    error: 'Authentication required' 
                });
            }

            const permitted = await authService.hasPermission(req.user.id, permission);
            
            if (!permitted) {
                return res.status(403).json({ 
                    success: false, 
                    error: 'You do not have permission to perform this action' 
                });
            }

            next();
            
        } catch (error) {
            console.error('Permission check error:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Permission check failed' 
            });
        }
    };
};

module.exports = {
    authenticate,
    authorize,
    hasPermission
};