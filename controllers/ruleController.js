const Rule = require('../models/Rule');

exports.createRule = async (req, res) => {
    try {
        if (req.user.role !== 'superadmin' && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Not authorized' });
        }
        const { title, assignedRoles, assignedUsers } = req.body;
        
        const lowercasedRoles = (assignedRoles || []).map(r => r.toLowerCase());

        const newRule = new Rule({
            title,
            assignedRoles: lowercasedRoles,
            assignedUsers,
            points: [],
            createdBy: req.user.userId
        });
        await newRule.save();
        res.status(201).json(newRule);
    } catch (error) {
        res.status(500).json({ message: 'Error creating Rule', error: error.message });
    }
};

exports.getRules = async (req, res) => {
    try {
        const user = req.user;
        
        // Fetch the full user object to get the category
        const fullUser = await require('../models/User').findById(user.userId);

        let query = {};
        
        if (req.query.assignedOnly === 'true' || fullUser.role === 'team') {
            // Filter Rules to only those assigned to this specific user (by role, category, or user ID)
            const rolesToCheck = [fullUser.role.toLowerCase()];
            if (fullUser.category) {
                rolesToCheck.push(fullUser.category.toLowerCase());
            }

            query = {
                $or: [
                    { assignedRoles: { $in: rolesToCheck } },
                    { assignedUsers: fullUser._id }
                ]
            };
        } else if (fullUser.role === 'admin') {
            query.createdBy = fullUser._id;
        }
        
        const rules = await Rule.find(query).populate('assignedUsers', 'name email').sort({ createdAt: -1 });
        res.json(rules);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching Rules', error: error.message });
    }
};

exports.updateRule = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, assignedRoles, assignedUsers } = req.body;
        
        const lowercasedRoles = (assignedRoles || []).map(r => r.toLowerCase());

        const updatedRule = await Rule.findByIdAndUpdate(
            id,
            { title, assignedRoles: lowercasedRoles, assignedUsers },
            { new: true, runValidators: true }
        ).populate('assignedUsers', 'name email');
        
        if (!updatedRule) return res.status(404).json({ message: 'Rule not found' });
        res.json(updatedRule);
    } catch (error) {
        res.status(500).json({ message: 'Error updating Rule', error: error.message });
    }
};

exports.deleteRule = async (req, res) => {
    try {
        const { id } = req.params;
        const deletedRule = await Rule.findByIdAndDelete(id);
        if (!deletedRule) return res.status(404).json({ message: 'Rule not found' });
        res.json({ message: 'Rule deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting Rule', error: error.message });
    }
};

// Points Management
exports.addPoint = async (req, res) => {
    try {
        const { id } = req.params;
        const { heading, description } = req.body;
        
        const rule = await Rule.findById(id);
        if (!rule) return res.status(404).json({ message: 'Rule not found' });
        
        rule.points.push({ heading, description });
        await rule.save();
        
        res.json(rule);
    } catch (error) {
        res.status(500).json({ message: 'Error adding point', error: error.message });
    }
};

exports.updatePoint = async (req, res) => {
    try {
        const { id, pointId } = req.params;
        const { heading, description } = req.body;
        
        const rule = await Rule.findOneAndUpdate(
            { _id: id, "points._id": pointId },
            { $set: { "points.$.heading": heading, "points.$.description": description } },
            { new: true }
        );
        
        if (!rule) return res.status(404).json({ message: 'Rule or Point not found' });
        res.json(rule);
    } catch (error) {
        res.status(500).json({ message: 'Error updating point', error: error.message });
    }
};

exports.deletePoint = async (req, res) => {
    try {
        const { id, pointId } = req.params;
        
        const rule = await Rule.findByIdAndUpdate(
            id,
            { $pull: { points: { _id: pointId } } },
            { new: true }
        );
        
        if (!rule) return res.status(404).json({ message: 'Rule not found' });
        res.json(rule);
    } catch (error) {
        res.status(500).json({ message: 'Error deleting point', error: error.message });
    }
};
