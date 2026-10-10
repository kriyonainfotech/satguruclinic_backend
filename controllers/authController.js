const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { calculatePerformance } = require('../utils/performanceHelper');

// Ye login function hai. Email aur password check karke token deta hai.
exports.login = async (req, res) => {
    const { email, password } = req.body;
    
    try {
        // 1. Check if user exists
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: 'Invalid email or password' });
        }

        // 2. Match password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid email or password' });
        }

        // 3. Generate Token (Taki frontend ko pata rahe user logged in hai)
        // Note: JWT_SECRET ko hamesha .env file me rakhna chahiye, yaha hum temporary secret use kar rahe hain
        const token = jwt.sign(
            { userId: user._id, role: user.role },
            process.env.JWT_SECRET || 'supersecretkey',
            { expiresIn: '1d' }
        );

        res.status(200).json({
            message: 'Login successful',
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error during login', error: error.message });
    }
};

// Mobile sanitizer and validator helper
const cleanMobileNumber = (mobile) => {
    if (!mobile) return '';
    let cleaned = mobile.toString().replace(/\D/g, '');
    if (cleaned.length === 12 && cleaned.startsWith('91')) {
        cleaned = cleaned.slice(2);
    } else if (cleaned.length === 11 && cleaned.startsWith('0')) {
        cleaned = cleaned.slice(1);
    }
    return cleaned.slice(0, 10);
};

// Naya user bananeka function (Admin ya Team ke liye)
exports.registerUser = async (req, res) => {
    let { name, email, password, role, mobile, birthDate, category, timingType, timings, adminId: reqAdminId } = req.body;
    if (name) name = name.trim();

    try {
        if (!['admin', 'team'].includes(role)) {
            return res.status(400).json({ message: 'Invalid role' });
        }

        if (role === 'admin' && req.user.role !== 'superadmin') {
            return res.status(403).json({ message: 'Only superadmin can create admins' });
        }
        if (role === 'team' && !['superadmin', 'admin'].includes(req.user.role)) {
            return res.status(403).json({ message: 'Not authorized to create team members' });
        }

        let sanitizedMobile = '';
        if (mobile) {
            sanitizedMobile = cleanMobileNumber(mobile);
            if (sanitizedMobile.length !== 10) {
                return res.status(400).json({ message: 'Mobile number must be exactly 10 digits' });
            }
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        let adminId = reqAdminId;
        if (role === 'team' && req.user.role === 'admin') {
            adminId = req.user.userId;
        }

        const newUser = new User({
            name,
            email,
            password: hashedPassword,
            mobile: sanitizedMobile,
            birthDate: birthDate ? new Date(birthDate) : undefined,
            role,
            category: category || '',
            salary: req.body.salary || 0,
            timingType: timingType || 'normal',
            timings: timings || [],
            ...(adminId && { adminId })
        });

        await newUser.save();
        res.status(201).json({ message: 'User registered successfully', role: newUser.role });
    } catch (error) {
        res.status(500).json({ message: 'Error registering user', error: error.message });
    }
};

// Fetch users by role
exports.getUsersByRole = async (req, res) => {
    try {
        const { role } = req.params;
        
        // Authorization check
        if (role === 'admin' && !['superadmin', 'admin'].includes(req.user.role)) {
            return res.status(403).json({ message: 'Not authorized to view admins' });
        }
        if (role === 'team' && !['superadmin', 'admin', 'team'].includes(req.user.role)) {
            return res.status(403).json({ message: 'Not authorized to view team' });
        }

        const query = { role };
        if (role === 'team' && req.user.role === 'admin') {
            query.adminId = req.user.userId;
        }
                let users = await User.find(query).select('-password');
        
        if (role === 'team') {
            const Attendance = require('../models/Attendance');
            const Task = require('../models/Task');
            
            const usersWithScore = await Promise.all(users.map(async (u) => {
                const userObj = u.toObject();
                
                const attendances = await Attendance.find({ userId: u._id });
                const userTasks = await Task.find({ assignedTo: u._id });
                const { performanceScore } = calculatePerformance(u, attendances, userTasks);
                userObj.performanceScore = performanceScore;
                
                return userObj;
            }));
            return res.json(usersWithScore);
        }
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching users', error: error.message });
    }
};

// Update user
exports.updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        console.log("UPDATE USER REQUEST: ", id, req.body);
        const { name, mobile, email, birthDate, category, timingType, timings, adminId } = req.body;

        const userToUpdate = await User.findById(id);
        if (!userToUpdate) return res.status(404).json({ message: 'User not found' });

        if (userToUpdate.role === 'admin' && req.user.role !== 'superadmin') {
            return res.status(403).json({ message: 'Not authorized to edit admins' });
        }
        if (userToUpdate.role === 'team' && !['superadmin', 'admin'].includes(req.user.role)) {
            return res.status(403).json({ message: 'Not authorized to edit team' });
        }

        if (mobile !== undefined) {
            const sanitizedMobile = cleanMobileNumber(mobile);
            if (sanitizedMobile && sanitizedMobile.length !== 10) {
                return res.status(400).json({ message: 'Mobile number must be exactly 10 digits' });
            }
            userToUpdate.mobile = sanitizedMobile;
        }

        userToUpdate.name = name || userToUpdate.name;
        userToUpdate.email = email || userToUpdate.email;
        if (category !== undefined) {
            userToUpdate.category = category;
        }
        if (timingType !== undefined) {
            userToUpdate.timingType = timingType;
        }
        if (timings !== undefined) {
            userToUpdate.timings = timings;
        }
        if (req.body.salary !== undefined) {
            userToUpdate.salary = req.body.salary;
        }

        // Update birthDate (allow clearing it by sending null/empty string)
        if (birthDate !== undefined) {
            userToUpdate.birthDate = birthDate ? new Date(birthDate) : null;
        }

        if (adminId !== undefined && req.user.role === 'superadmin') {
            userToUpdate.adminId = adminId || null;
        }

        await userToUpdate.save();
        res.json({ message: 'User updated successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error updating user', error: error.message });
    }
};

// Delete user
exports.deleteUser = async (req, res) => {
    try {
        const { id } = req.params;
        const userToDelete = await User.findById(id);
        if (!userToDelete) return res.status(404).json({ message: 'User not found' });

        if (userToDelete.role === 'admin' && req.user.role !== 'superadmin') {
            return res.status(403).json({ message: 'Not authorized to delete admins' });
        }
        if (userToDelete.role === 'team' && !['superadmin', 'admin'].includes(req.user.role)) {
            return res.status(403).json({ message: 'Not authorized to delete team' });
        }

        await User.findByIdAndDelete(id);
        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting user', error: error.message });
    }
};

// Change / Reset password for user
exports.changeUserPassword = async (req, res) => {
    try {
        const { id } = req.params;
        const { newPassword } = req.body;

        if (!newPassword || newPassword.length < 4) {
            return res.status(400).json({ message: 'Password must be at least 4 characters long' });
        }

        const userToUpdate = await User.findById(id);
        if (!userToUpdate) return res.status(404).json({ message: 'User not found' });

        // Permissions:
        // Superadmin can change password for any admin or team member
        // Admin can change password for team members (or self)
        if (userToUpdate.role === 'admin' && req.user.role !== 'superadmin' && req.user.userId !== id) {
            return res.status(403).json({ message: 'Not authorized to change admin password' });
        }
        if (userToUpdate.role === 'team' && !['superadmin', 'admin'].includes(req.user.role) && req.user.userId !== id) {
            return res.status(403).json({ message: 'Not authorized to change team password' });
        }

        const salt = await bcrypt.genSalt(10);
        userToUpdate.password = await bcrypt.hash(newPassword, salt);
        await userToUpdate.save();

        res.json({ message: 'Password changed successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error changing password', error: error.message });
    }
};

// Get today's birthdays — matches month + day across all roles
exports.getTodayBirthdays = async (req, res) => {
    try {
        const today = new Date();
        const todayMonth = today.getMonth() + 1;
        const todayDay = today.getDate();

        const users = await User.find({
            birthDate: { $exists: true, $ne: null },
            $expr: {
                $and: [
                    { $eq: [{ $month: '$birthDate' }, todayMonth] },
                    { $eq: [{ $dayOfMonth: '$birthDate' }, todayDay] }
                ]
            }
        }).select('name role birthDate');

        res.json(users);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching today birthdays', error: error.message });
    }
};

// Get all users with birthDate sorted by month+day (for birthday list page)
exports.getAllBirthdays = async (req, res) => {
    try {
        const users = await User.aggregate([
            { $match: { birthDate: { $exists: true, $ne: null }, role: { $in: ['admin', 'team'] } } },
            { $addFields: { birthMonth: { $month: '$birthDate' }, birthDay: { $dayOfMonth: '$birthDate' } } },
            { $sort: { birthMonth: 1, birthDay: 1 } },
            { $project: { name: 1, role: 1, birthDate: 1 } }
        ]);
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching all birthdays', error: error.message });
    }
};


exports.getAllUsers = async (req, res) => {
    try {
        const users = await User.find({}).select('-password');
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching users', error: error.message });
    }
};

