const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authMiddleware = async (req, res, next) => {
    // Get token from header
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'No token, authorization denied' });
    }

    const token = authHeader.split(' ')[1];

    try {
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecretkey');
        
        const userId = decoded.userId || decoded.id;
        if (!userId) {
            return res.status(401).json({ message: 'Invalid token payload' });
        }

        // Verify that user still exists in database and is not deleted
        const user = await User.findById(userId).select('-password');
        if (!user) {
            return res.status(401).json({ message: 'User account has been deleted or deactivated' });
        }

        // Add user from payload and DB
        req.user = {
            ...decoded,
            userId: user._id.toString(),
            id: user._id.toString(),
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            category: user.category || '',
            adminId: user.adminId,
            teamLevel: user.teamLevel || '',
            seniorId: user.seniorId
        };
        next();
    } catch (err) {
        if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Token is not valid or expired' });
        }
        console.error('Auth middleware error:', err);
        return res.status(401).json({ message: 'Authentication failed' });
    }
};

module.exports = authMiddleware;
