const mongoose = require('mongoose');
const Task = require('../models/Task');
const User = require('../models/User');
const { hasPermission } = require('../utils/permissions');

const denied = (res) => res.status(403).json({ message: 'Aapko ye karne ki permission nahi hai' });

// Helper to construct date range for filtering
const getDateFilter = (dateString) => {
    if (!dateString) return null;
    const start = new Date(dateString);
    start.setHours(0, 0, 0, 0);
    const end = new Date(dateString);
    end.setHours(23, 59, 59, 999);
    return { $gte: start, $lte: end };
};

// Senior ke juniors ki IDs (string array)
const getJuniorIds = async (seniorId) => {
    const juniors = await User.find({ role: 'team', seniorId }).select('_id');
    return juniors.map(u => u._id.toString());
};

// Team member ye task manage kar sakta hai? (khud ka task ya uske junior ka task)
const canTeamManageTask = async (task, currentUserId) => {
    const assigneeId = task.assignedTo.toString();
    if (assigneeId === currentUserId.toString()) return true;
    const juniorIds = await getJuniorIds(currentUserId);
    return juniorIds.includes(assigneeId);
};

// 1. Create a new Task (supports single assignedTo ID, array of IDs, ALL_TEAM, or ALL_ADMIN)
exports.createTask = async (req, res) => {
    try {
        const { title, description, remark, category, assignedTo, dueDate, dueDates, priority, checklistTemplate, checklistItems } = req.body;
        const currentUserId = req.user.userId;
        const currentUserRole = req.user.role;
        
        console.log('createTask payload:', JSON.stringify(req.body));
        
        if (!title) console.log('Missing title');
        if (!assignedTo) console.log('Missing assignedTo:', assignedTo);
        if (!dueDate && (!dueDates || dueDates.length === 0)) console.log('Missing dueDate/dueDates');

        // Either dueDates (array) or dueDate must be provided
        if (!title || !assignedTo || (!dueDate && (!dueDates || dueDates.length === 0))) {
            return res.status(400).json({ message: 'Title, Assigned User, and Due Date are required' });
        }

        const datesToProcess = dueDates && dueDates.length > 0 ? dueDates : [dueDate];

        // Ek se zyada dates = Bulk Add, warna normal Add Task
        const createAction = datesToProcess.length > 1 ? 'tasks:bulk-add' : 'tasks:create';
        if (!(await hasPermission(req.user, createAction))) return denied(res);

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

        const isBulk = datesToProcess.length > 1;
        const bulkGroupId = isBulk ? new mongoose.Types.ObjectId().toString() : undefined;
        const bulkStartDate = isBulk ? new Date(datesToProcess[0]) : undefined;
        const bulkEndDate = isBulk ? new Date(datesToProcess[datesToProcess.length - 1]) : undefined;

        const createdTasks = [];

        for (const targetId of targetIds) {
            const targetUser = await User.findById(targetId);
            if (!targetUser) continue;

            // Permission check:
            if (currentUserRole === 'team') {
                // Team member khud ko ya apne junior ko hi task de sakta hai
                if (targetUser.role === 'team'
                    && targetUser._id.toString() !== currentUserId.toString()
                    && targetUser.seniorId?.toString() !== currentUserId.toString()) continue;
                if (targetUser.role === 'superadmin') continue;
            } else if (currentUserRole === 'admin') {
                if (targetUser.role === 'superadmin') continue;
                if (targetUser.role === 'admin' && targetUser._id.toString() !== currentUserId.toString()) continue;
                if (targetUser.role === 'team' && targetUser.adminId?.toString() !== currentUserId.toString()) continue;
            }

            for (const d of datesToProcess) {
                const task = new Task({
                    title,
                    description: description || '',
                    remark: remark || '',
                    category: category || 'General',
                    assignedTo: targetId,
                    assignedBy: currentUserId,
                    dueDate: new Date(d),
                    priority: priority || 'Medium',
                    checklistTemplate: checklistTemplate || undefined,
                    checklistItems: checklistItems || [],
                    status: 'Pending',
                    isBulkTask: isBulk,
                    bulkGroupId,
                    bulkStartDate,
                    bulkEndDate
                });

                await task.save();

                const populatedTask = await Task.findById(task._id)
                    .populate('assignedTo', 'name email role')
                    .populate('assignedBy', 'name email role');

                createdTasks.push(populatedTask);
            }
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
            if (tab === 'admin') {
                const adminUsers = await User.find({ role: 'admin' }).select('_id');
                const adminIds = adminUsers.map(u => u._id);
                query.assignedTo = { $in: adminIds };
            } else if (tab === 'team') {
                // Senior ke juniors ke tasks
                const juniorIds = await getJuniorIds(currentUserId);
                query.assignedTo = { $in: juniorIds };
            } else {
                query.assignedTo = currentUserId;
            }
        } else if (currentUserRole === 'admin') {
            if (tab === 'my' || myTasks === 'true') {
                query.assignedTo = currentUserId;
            } else if (tab === 'team') {
                const myTeamUsers = await User.find({ role: 'team', adminId: currentUserId }).select('_id');
                const myTeamIds = myTeamUsers.map(u => u._id);
                query.assignedTo = { $in: myTeamIds };
            } else {
                // If admin tab or all tab or no tab is passed
                query.assignedTo = currentUserId; // Default to self to prevent unauthorized viewing
            }
        } else {
            // Superadmin logic
            if (tab === 'my' || myTasks === 'true') {
                query.assignedTo = currentUserId;
            } else if (tab && ['superadmin', 'admin', 'team'].includes(tab)) {
                const usersWithRole = await User.find({ role: tab }).select('_id');
                const userIds = usersWithRole.map(u => u._id);
                query.assignedTo = { $in: userIds };
            }
        }

        // Additional filter
        if (assignedTo && currentUserRole === 'superadmin') {
            query.assignedTo = assignedTo;
        } else if (assignedTo && currentUserRole === 'admin') {
            // Check if assignedTo belongs to admin's team or self
            if (assignedTo.toString() === currentUserId.toString()) {
                 query.assignedTo = assignedTo;
            } else {
                 const teamUser = await User.findOne({ _id: assignedTo, adminId: currentUserId });
                 if (teamUser) query.assignedTo = assignedTo;
            }
        } else if (assignedTo && currentUserRole === 'team') {
            if (assignedTo.toString() === currentUserId.toString()) {
                query.assignedTo = assignedTo;
            } else {
                const juniorIds = await getJuniorIds(currentUserId);
                if (juniorIds.includes(assignedTo.toString())) query.assignedTo = assignedTo;
            }
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
                query = { _id: req.user.userId };
            } else if (role === 'team') {
                query = { role: 'team', adminId: req.user.userId };
            } else {
                query = { $or: [{ _id: req.user.userId }, { role: 'team', adminId: req.user.userId }] };
            }
        } else if (currentUserRole === 'team') {
            const currentUser = await User.findById(req.user.userId);
            // Senior ho to apne juniors bhi assignable hain
            const juniorIds = await getJuniorIds(req.user.userId);
            const selfAndJuniors = [req.user.userId, ...juniorIds];
            if (role === 'admin') {
                query = currentUser.adminId ? { _id: currentUser.adminId } : { _id: null };
            } else if (role === 'team') {
                query = { _id: { $in: selfAndJuniors } };
            } else {
                query = currentUser.adminId 
                  ? { _id: { $in: [currentUser.adminId, ...selfAndJuniors] } }
                  : { _id: { $in: selfAndJuniors } };
            }
        } else {
            query = { _id: req.user.userId };
        }

        const users = await User.find(query).select('name email role mobile teamLevel seniorId');
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
        const { title, description, remark, category, assignedTo, dueDate, status, priority, checklistTemplate, checklistItems } = req.body;
        const currentUserId = req.user.userId;
        const currentUserRole = req.user.role;

        // View popup se sirf checklist tick/untick ya remark save karne pe edit permission nahi maangta
        const isViewUpdate = Object.keys(req.body).every(k => ['checklistItems', 'remark'].includes(k));
        if (!isViewUpdate && !(await hasPermission(req.user, 'tasks:edit'))) return denied(res);

        const task = await Task.findById(id);
        if (!task) {
            return res.status(404).json({ message: 'Task not found' });
        }

        // Team members can only edit their own tasks (ya senior apne junior ke tasks)
        if (currentUserRole === 'team' && !(await canTeamManageTask(task, currentUserId))) {
            return res.status(403).json({ message: 'Team members can only edit their own or their juniors tasks' });
        }

        // If admin or team, check if assigning to superadmin
        if (assignedTo && ['admin', 'team'].includes(currentUserRole)) {
            const targetUser = await User.findById(assignedTo);
            if (targetUser && targetUser.role === 'superadmin') {
                return res.status(403).json({ message: 'Cannot assign tasks to Super Admin' });
            }
            if (currentUserRole === 'team' && targetUser && targetUser.role === 'team'
                && targetUser._id.toString() !== currentUserId.toString()
                && targetUser.seniorId?.toString() !== currentUserId.toString()) {
                return res.status(403).json({ message: 'Team members can only assign tasks to themselves or their juniors' });
            }
        }

        
        if (task.isBulkTask && task.bulkGroupId && req.body.bulkDueDates && req.body.bulkDueDates.length > 0) {
            const newDueDates = req.body.bulkDueDates.map(d => new Date(d).toISOString().split('T')[0]);
            const existingTasks = await Task.find({ bulkGroupId: task.bulkGroupId });
            
            const commonFields = {
                title: title !== undefined ? title : task.title,
                description: description !== undefined ? description : task.description,
                remark: remark !== undefined ? remark : task.remark,
                category: category !== undefined ? category : task.category,
                assignedTo: assignedTo !== undefined ? assignedTo : task.assignedTo,
                priority: priority !== undefined ? priority : task.priority,
            };

            for (const existingTask of existingTasks) {
                const existingDateStr = new Date(existingTask.dueDate).toISOString().split('T')[0];
                if (!newDueDates.includes(existingDateStr)) {
                    await Task.findByIdAndDelete(existingTask._id);
                } else {
                    await Task.findByIdAndUpdate(existingTask._id, {
                        ...commonFields,
                        bulkStartDate: new Date(req.body.bulkDueDates[0]),
                        bulkEndDate: new Date(req.body.bulkDueDates[req.body.bulkDueDates.length - 1])
                    });
                }
            }

            const existingDateStrs = existingTasks.map(t => new Date(t.dueDate).toISOString().split('T')[0]);
            const datesToCreate = newDueDates.filter(d => !existingDateStrs.includes(d));

            for (const d of datesToCreate) {
                const newTask = new Task({
                    ...commonFields,
                    assignedBy: currentUserId,
                    dueDate: new Date(d),
                    status: 'Pending',
                    isBulkTask: true,
                    bulkGroupId: task.bulkGroupId,
                    bulkStartDate: new Date(req.body.bulkDueDates[0]),
                    bulkEndDate: new Date(req.body.bulkDueDates[req.body.bulkDueDates.length - 1])
                });
                await newTask.save();
            }

            const updatedOriginal = await Task.findById(id).populate('assignedTo', 'name email role').populate('assignedBy', 'name email role');
            return res.status(200).json({ message: 'Bulk task updated successfully', task: updatedOriginal || existingTasks[0] });
        }

        if (title !== undefined) task.title = title;
        if (description !== undefined) task.description = description;
        if (remark !== undefined) task.remark = remark;
        if (category !== undefined) task.category = category;
        if (assignedTo !== undefined) task.assignedTo = assignedTo;
        if (dueDate !== undefined) task.dueDate = new Date(dueDate);
        if (status !== undefined) task.status = status;
        if (priority !== undefined) task.priority = priority;
        if (checklistTemplate !== undefined) task.checklistTemplate = checklistTemplate;
        if (checklistItems !== undefined) task.checklistItems = checklistItems;

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

        // Team members can only update status of their own tasks (ya senior apne junior ke tasks)
        if (currentUserRole === 'team' && !(await canTeamManageTask(task, currentUserId))) {
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
        if (!(await hasPermission(req.user, 'tasks:delete'))) return denied(res);

        const task = await Task.findById(id);
        if (!task) {
            return res.status(404).json({ message: 'Task not found' });
        }

        // Team members can only delete their own tasks (ya senior apne junior ke tasks)
        if (currentUserRole === 'team' && !(await canTeamManageTask(task, currentUserId))) {
            return res.status(403).json({ message: 'Team members can only delete their own tasks' });
        }

        await Task.findByIdAndDelete(id);
        res.json({ message: 'Task deleted successfully' });
    } catch (error) {
        console.error('Error deleting task:', error);
        res.status(500).json({ message: 'Error deleting task', error: error.message });
    }
};




