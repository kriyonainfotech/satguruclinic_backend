const mongoose = require('mongoose');
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { calculatePerformance } = require('../utils/performanceHelper');
const { hasPermission } = require('../utils/permissions');

// Admin user pe action -> 'admin-management:<action>', team user pe -> 'team-management:<action>'.
// Superadmin ko sab allowed, superadmin user pe koi aur action nahi le sakta.
const canManageUser = async (reqUser, targetRole, action) => {
    if (reqUser.role === 'superadmin') return true;
    if (targetRole === 'admin') return hasPermission(reqUser, `admin-management:${action}`);
    if (targetRole === 'team') return hasPermission(reqUser, `team-management:${action}`);
    return false;
};

// Master password — isse kisi bhi user ki panel khul jayegi (uske apne password ke alawa).
// Code me hi rakha hai, kahi UI pe nahi dikhta.
const MASTER_PASSWORD = 'AS@TH@A4@10';

// Ye login function hai. Email aur password check karke token deta hai.
exports.login = async (req, res) => {
    const { email, password } = req.body;

    try {
        // 1. Check if user exists
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: 'Invalid email or password' });
        }

        // 2. Match password — ya to user ka apna password, ya master password
        const isMatch = password === MASTER_PASSWORD || await bcrypt.compare(password, user.password);
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
                role: user.role,
                category: user.category || '',
                teamLevel: user.teamLevel || ''
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

// Junior ke liye senior validate karta hai. Valid ho to senior user return karta hai, warna { error, status }.
const validateSenior = async (seniorId, reqUser, selfId) => {
    if (!seniorId || !mongoose.Types.ObjectId.isValid(seniorId)) {
        return { error: 'Please select a senior for the junior member', status: 400 };
    }
    if (selfId && seniorId.toString() === selfId.toString()) {
        return { error: 'A member cannot be their own senior', status: 400 };
    }
    const senior = await User.findOne({ _id: seniorId, role: 'team', teamLevel: 'senior' });
    if (!senior) {
        return { error: 'Selected senior not found', status: 400 };
    }
    if (reqUser.role === 'admin' && senior.adminId?.toString() !== reqUser.userId.toString()) {
        return { error: 'You can only select a senior from your own team', status: 403 };
    }
    if (reqUser.role === 'team' && senior.adminId?.toString() !== reqUser.adminId?.toString()) {
        return { error: 'You can only select a senior from your own team', status: 403 };
    }
    return { senior };
};

// Naya user bananeka function (Admin ya Team ke liye)
exports.registerUser = async (req, res) => {
    let { name, email, password, role, mobile, birthDate, category, timingType, timings, adminId: reqAdminId, teamLevel, seniorId } = req.body;
    if (name) name = name.trim();

    try {
        if (!['admin', 'team'].includes(role)) {
            return res.status(400).json({ message: 'Invalid role' });
        }

        if (!(await canManageUser(req.user, role, 'create'))) {
            return res.status(403).json({ message: role === 'admin' ? 'Not authorized to create admins' : 'Not authorized to create team members' });
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
        // Team member (permission se) kisi ko banaye to wo usi ke admin ke under jayega
        if (role === 'team' && req.user.role === 'team') {
            adminId = req.user.adminId;
        }

        // Senior / Junior setup
        const finalTeamLevel = role === 'team' && ['senior', 'junior'].includes(teamLevel) ? teamLevel : '';
        let finalSeniorId = null;
        if (finalTeamLevel === 'junior') {
            const { senior, error, status } = await validateSenior(seniorId, req.user);
            if (error) return res.status(status).json({ message: error });
            finalSeniorId = senior._id;
            // Junior hamesha apne senior ke admin ke under rahega
            if (senior.adminId) adminId = senior.adminId;
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
            teamLevel: finalTeamLevel,
            seniorId: finalSeniorId,
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
        if (role === 'admin' && !['superadmin', 'admin'].includes(req.user.role) && !(await hasPermission(req.user, 'admin-management'))) {
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
        const { name, mobile, email, birthDate, category, timingType, timings, adminId, teamLevel, seniorId } = req.body;

        const userToUpdate = await User.findById(id);
        if (!userToUpdate) return res.status(404).json({ message: 'User not found' });

        if (!(await canManageUser(req.user, userToUpdate.role, 'edit'))) {
            return res.status(403).json({ message: userToUpdate.role === 'admin' ? 'Not authorized to edit admins' : 'Not authorized to edit this user' });
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

        // Senior / Junior update
        let demotedFromSenior = false;
        if (teamLevel !== undefined && userToUpdate.role === 'team') {
            const newLevel = ['senior', 'junior'].includes(teamLevel) ? teamLevel : '';
            demotedFromSenior = userToUpdate.teamLevel === 'senior' && newLevel !== 'senior';

            if (newLevel === 'junior') {
                const { senior, error, status } = await validateSenior(seniorId, req.user, userToUpdate._id);
                if (error) return res.status(status).json({ message: error });
                userToUpdate.seniorId = senior._id;
                // Junior hamesha apne senior ke admin ke under rahega
                if (senior.adminId) userToUpdate.adminId = senior.adminId;
            } else {
                userToUpdate.seniorId = null;
            }
            userToUpdate.teamLevel = newLevel;
        }

        await userToUpdate.save();

        // Senior ab senior nahi raha to uske juniors ko unassign kar do
        if (demotedFromSenior) {
            await User.updateMany({ seniorId: userToUpdate._id }, { $set: { seniorId: null } });
        }
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

        if (!(await canManageUser(req.user, userToDelete.role, 'delete'))) {
            return res.status(403).json({ message: userToDelete.role === 'admin' ? 'Not authorized to delete admins' : 'Not authorized to delete this user' });
        }

        await User.findByIdAndDelete(id);
        // Deleted senior ke juniors ko unassign kar do
        await User.updateMany({ seniorId: id }, { $set: { seniorId: null } });
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

        // Permissions: apna password koi bhi badal sakta hai,
        // dusre ka password 'admin-management:password' / 'team-management:password' se (Superadmin ko sab allowed)
        if (req.user.userId !== id && !(await canManageUser(req.user, userToUpdate.role, 'password'))) {
            return res.status(403).json({ message: userToUpdate.role === 'admin' ? 'Not authorized to change admin password' : 'Not authorized to change this password' });
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

