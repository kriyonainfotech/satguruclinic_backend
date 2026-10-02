const mongoose = require('mongoose');
const Task = require('../models/Task');
const User = require('../models/User');

// Helper to construct date range for filtering
const getDateFilter = (dateString) => {
    if (!dateString) return null;
    const start = new Date(dateString);
    start.setHours(0, 0, 0, 0);
    const end = new Date(dateString);
    end.setHours(23, 59, 59, 999);
    return { $gte: start, $lte: end };
};

// 1. Create a new Task (supports single assignedTo ID, array of IDs, ALL_TEAM, or ALL_ADMIN)
exports.createTask = async (req, res) => {
    try {
        const { title, description, category, assignedTo, dueDate, priority } = req.body;
        const currentUserId = req.user.userId;
        const currentUserRole = req.user.role;

        if (!title || !assignedTo || !dueDate) {
            return res.status(400).json({ message: 'Title, Assigned User, and Due Date are required' });
        }

        // Support ALL_TEAM, ALL_ADMIN, array of user IDs or single ID
        let targetIds = [];
        if (assignedTo === 'ALL_TEAM') {
            const teamUsers = await User.find({ role: 'team' }).select('_id');
            targetIds = teamUsers.map(u => u._id.toString());
        } else if (assignedTo === 'ALL_ADMIN') {
            const adminUsers = await User.find({ role: 'admin' }).select('_id');
            targetIds = adminUsers.map(u => u._id.toString());
        } else if (Array.isArray(assignedTo)) {
            targetIds = assignedTo;
        } else if (typeof assignedTo === 'string' && assignedTo.includes(',')) {
            targetIds = assignedTo.split(',').map(s => s.trim());
        } else {
            targetIds = [assignedTo];
        }

        // Keep only valid ObjectIds to prevent any CastError
        targetIds = targetIds.filter(id => id && mongoose.Types.ObjectId.isValid(id));

        if (targetIds.length === 0) {
            return res.status(400).json({ message: 'No valid assigned user IDs found' });
        }

        const createdTasks = [];

        for (const targetId of targetIds) {
            const targetUser = await User.findById(targetId);
            if (!targetUser) continue;

            // Permission check:
            // Superadmin: can assign to superadmin, admin, or team
            // Admin: can assign to team, or admin (including self)
            // Team: can assign to self or admin, but NOT to other team members or superadmin
            if (currentUserRole === 'team') {
                if (targetUser.role === 'team' && targetUser._id.toString() !== currentUserId.toString()) {
                    continue;
                }
                if (targetUser.role === 'superadmin') {
                    continue;
                }
            } else if (currentUserRole === 'admin' && targetUser.role === 'superadmin') {
                continue;
            }

            const task = new Task({
                title,
                description: description || '',
                category: category || 'General',
                assignedTo: targetId,
                assignedBy: currentUserId,
                dueDate: new Date(dueDate),
                priority: priority || 'Medium',
                status: 'Pending'
            });

            await task.save();

            const populatedTask = await Task.findById(task._id)
                .populate('assignedTo', 'name email role')
                .populate('assignedBy', 'name email role');

            createdTasks.push(populatedTask);
        }

        if (createdTasks.length === 0) {
            return res.status(400).json({ message: 'No valid assignees found or permission denied' });
        }

        res.status(201).json({
            message: createdTasks.length > 1
                ? `Tasks created successfully for ${createdTasks.length} members`
                : 'Task created successfully',
            task: createdTasks[0],
            tasks: createdTasks
        });
    } catch (error) {
        console.error('Error creating task:', error);
        res.status(500).json({ message: error.message || 'Error creating task', error: error.message });
    }
};

// 2. Get Tasks with role-based visibility and filters
exports.getTasks = async (req, res) => {
    try {
        const currentUserId = req.user.userId;
        const currentUserRole = req.user.role;
        const { myTasks, tab, assignedTo, category, status, priority, date, month, year, search, dateFrom, dateTo } = req.query;

        let query = {};

        // Role-based visibility
        if (currentUserRole === 'team') {
            // Team members can NEVER see other team members' tasks!
            if (tab === 'admin') {
                const adminUsers = await User.find({ role: 'admin' }).select('_id');
                const adminIds = adminUsers.map(u => u._id);
                query.assignedTo = { $in: adminIds };
            } else {
                // On 'my', 'team', or any other tab, only show tasks assigned to this team member!
                query.assignedTo = currentUserId;
            }
        } else if (tab === 'my' || myTasks === 'true') {
            query.assignedTo = currentUserId;
        } else if (tab && ['superadmin', 'admin', 'team'].includes(tab)) {
            const usersWithRole = await User.find({ role: tab }).select('_id');
            const userIds = usersWithRole.map(u => u._id);
            query.assignedTo = { $in: userIds };
        } else if (assignedTo) {
            query.assignedTo = assignedTo;
        }

        // Filter by category
        if (category && category !== 'all') {
            query.category = category;
        }

        // Filter by status
        if (status && status !== 'all') {
            query.status = status;
        }

        // Filter by priority
        if (priority && priority !== 'all') {
            query.priority = priority;
        }

        // Filter by search keyword
        if (search && search.trim()) {
            const regex = new RegExp(search.trim(), 'i');
            query.$or = [
                { title: regex },
                { description: regex },
                { category: regex }
            ];
        }

        // Filter by exact date or month
        if (date) {
            const dateRange = getDateFilter(date);
            if (dateRange) {
                query.dueDate = dateRange;
            }
        } else if (month && month.includes('-')) {
            // 'YYYY-MM'
            const [y, m] = month.split('-').map(Number);
            if (y && m) {
                const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
                const end = new Date(y, m, 0, 23, 59, 59, 999);
                query.dueDate = { $gte: start, $lte: end };
            }
        } else if (year && month) {
            const y = parseInt(year, 10);
            const m = parseInt(month, 10);
            if (!isNaN(y) && !isNaN(m)) {
                const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
                const end = new Date(y, m, 0, 23, 59, 59, 999);
                query.dueDate = { $gte: start, $lte: end };
            }
        } else if (year) {
            const y = parseInt(year, 10);
            if (!isNaN(y)) {
                const start = new Date(y, 0, 1, 0, 0, 0, 0);
                const end = new Date(y, 11, 31, 23, 59, 59, 999);
                query.dueDate = { $gte: start, $lte: end };
            }
        } else if (dateFrom || dateTo) {
            query.dueDate = {};
            if (dateFrom) {
                const start = new Date(dateFrom);
                start.setHours(0, 0, 0, 0);
                query.dueDate.$gte = start;
            }
            if (dateTo) {
                const end = new Date(dateTo);
                end.setHours(23, 59, 59, 999);
                query.dueDate.$lte = end;
            }
        }

        const tasks = await Task.find(query)
            .populate('assignedTo', 'name email role mobile')
            .populate('assignedBy', 'name email role')
            .sort({ dueDate: 1, createdAt: -1 });

        res.json(tasks);
    } catch (error) {
        console.error('Error fetching tasks:', error);
        res.status(500).json({ message: 'Error fetching tasks', error: error.message });
    }
};

// 3. Get assignable users based on current user's role
exports.getAssignableUsers = async (req, res) => {
    try {
        const currentUserRole = (req.user.role || '').toLowerCase();
        const { role } = req.query;

        let query = {};
        if (currentUserRole === 'superadmin') {
            query = role ? { role: role.toLowerCase() } : {};
        } else if (currentUserRole === 'admin') {
            if (role === 'admin') {
                query = { role: 'admin' };
            } else if (role === 'team') {
                query = { role: 'team' };
            } else {
                query = { role: { $in: ['admin', 'team'] } };
            }
        } else if (currentUserRole === 'team') {
            // Team members can only assign to self or admin, NOT other team members
            if (role === 'admin') {
                query = { role: 'admin' };
            } else if (role === 'team') {
                query = { _id: req.user.userId };
            } else {
                const adminUsers = await User.find({ role: 'admin' }).select('_id');
                const adminIds = adminUsers.map(u => u._id);
                query = { _id: { $in: [...adminIds, req.user.userId] } };
            }
        } else {
            query = { _id: req.user.userId };
        }

        const users = await User.find(query).select('name email role mobile');
        res.json(users);
    } catch (error) {
        console.error('Error fetching assignable users:', error);
        res.status(500).json({ message: 'Error fetching assignable users', error: error.message });
    }
};

// 4. Update task details
exports.updateTask = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, description, category, assignedTo, dueDate, status, priority } = req.body;
        const currentUserId = req.user.userId;
        const currentUserRole = req.user.role;

        const task = await Task.findById(id);
        if (!task) {
            return res.status(404).json({ message: 'Task not found' });
        }

        // Team members can only edit their own tasks
        if (currentUserRole === 'team' && task.assignedTo.toString() !== currentUserId.toString()) {
            return res.status(403).json({ message: 'Team members can only edit their own tasks' });
        }

        // If admin or team, check if assigning to superadmin
        if (assignedTo && ['admin', 'team'].includes(currentUserRole)) {
            const targetUser = await User.findById(assignedTo);
            if (targetUser && targetUser.role === 'superadmin') {
                return res.status(403).json({ message: 'Cannot assign tasks to Super Admin' });
            }
            if (currentUserRole === 'team' && targetUser.role === 'team' && targetUser._id.toString() !== currentUserId.toString()) {
                return res.status(403).json({ message: 'Team members cannot assign tasks to other team members' });
            }
        }

        if (title !== undefined) task.title = title;
        if (description !== undefined) task.description = description;
        if (category !== undefined) task.category = category;
        if (assignedTo !== undefined) task.assignedTo = assignedTo;
        if (dueDate !== undefined) task.dueDate = new Date(dueDate);
        if (status !== undefined) task.status = status;
        if (priority !== undefined) task.priority = priority;

        await task.save();

        const updatedTask = await Task.findById(id)
            .populate('assignedTo', 'name email role mobile')
            .populate('assignedBy', 'name email role');

        res.json({ message: 'Task updated successfully', task: updatedTask });
    } catch (error) {
        console.error('Error updating task:', error);
        res.status(500).json({ message: 'Error updating task', error: error.message });
    }
};

// 5. Update task status only (for assignee quick toggle)
exports.updateTaskStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const currentUserId = req.user.userId;
        const currentUserRole = req.user.role;

        if (!['Pending', 'In Progress', 'Completed', 'Overdue', 'Done'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status value' });
        }

        const task = await Task.findById(id);
        if (!task) {
            return res.status(404).json({ message: 'Task not found' });
        }

        // Team members can only update status of their own tasks
        if (currentUserRole === 'team' && task.assignedTo.toString() !== currentUserId.toString()) {
            return res.status(403).json({ message: 'Team members can only update status of their own tasks' });
        }

        task.status = status;
        await task.save();

        const updatedTask = await Task.findById(id)
            .populate('assignedTo', 'name email role mobile')
            .populate('assignedBy', 'name email role');

        res.json({ message: 'Task status updated', task: updatedTask });
    } catch (error) {
        console.error('Error updating task status:', error);
        res.status(500).json({ message: 'Error updating status', error: error.message });
    }
};

// 6. Delete task
exports.deleteTask = async (req, res) => {
    try {
        const { id } = req.params;
        const currentUserId = req.user.userId;
        const currentUserRole = req.user.role;

        if (!['superadmin', 'admin', 'team'].includes(currentUserRole)) {
            return res.status(403).json({ message: 'Not authorized to delete tasks' });
        }

        const task = await Task.findById(id);
        if (!task) {
            return res.status(404).json({ message: 'Task not found' });
        }

        // Team members can only delete their own tasks
        if (currentUserRole === 'team' && task.assignedTo.toString() !== currentUserId.toString()) {
            return res.status(403).json({ message: 'Team members can only delete their own tasks' });
        }

        await Task.findByIdAndDelete(id);
        res.json({ message: 'Task deleted successfully' });
    } catch (error) {
        console.error('Error deleting task:', error);
        res.status(500).json({ message: 'Error deleting task', error: error.message });
    }
};
