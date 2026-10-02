const SOP = require('../models/Sop');

exports.createSOP = async (req, res) => {
    try {
        if (req.user.role !== 'superadmin' && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Not authorized' });
        }
        const { title, assignedRoles, assignedUsers } = req.body;
        
        const lowercasedRoles = (assignedRoles || []).map(r => r.toLowerCase());

        const newSOP = new SOP({
            title,
            assignedRoles: lowercasedRoles,
            assignedUsers,
            points: [],
            createdBy: req.user.userId
        });
        await newSOP.save();
        res.status(201).json(newSOP);
    } catch (error) {
        res.status(500).json({ message: 'Error creating SOP', error: error.message });
    }
};

exports.getSOPs = async (req, res) => {
    try {
        const user = req.user;
        
        // Fetch the full user object to get the category
        const fullUser = await require('../models/User').findById(user.userId);

        let query = {};
        
        if (req.query.assignedOnly === 'true' || (fullUser.role !== 'superadmin' && fullUser.role !== 'admin')) {
            // Filter SOPs to only those assigned to this specific user (by role, category, or user ID)
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
        }
        
        const sops = await SOP.find(query).populate('assignedUsers', 'name email').sort({ createdAt: -1 });
        res.json(sops);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching SOPs', error: error.message });
    }
};

exports.updateSOP = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, assignedRoles, assignedUsers } = req.body;
        
        const lowercasedRoles = (assignedRoles || []).map(r => r.toLowerCase());

        const updatedSOP = await SOP.findByIdAndUpdate(
            id,
            { title, assignedRoles: lowercasedRoles, assignedUsers },
            { new: true, runValidators: true }
        ).populate('assignedUsers', 'name email');
        
        if (!updatedSOP) return res.status(404).json({ message: 'SOP not found' });
        res.json(updatedSOP);
    } catch (error) {
        res.status(500).json({ message: 'Error updating SOP', error: error.message });
    }
};

exports.deleteSOP = async (req, res) => {
    try {
        const { id } = req.params;
        const deletedSOP = await SOP.findByIdAndDelete(id);
        if (!deletedSOP) return res.status(404).json({ message: 'SOP not found' });
        res.json({ message: 'SOP deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting SOP', error: error.message });
    }
};

// Points Management
exports.addPoint = async (req, res) => {
    try {
        const { id } = req.params;
        const { heading, description } = req.body;
        
        const sop = await SOP.findById(id);
        if (!sop) return res.status(404).json({ message: 'SOP not found' });
        
        sop.points.push({ heading, description });
        await sop.save();
        
        res.json(sop);
    } catch (error) {
        res.status(500).json({ message: 'Error adding point', error: error.message });
    }
};

exports.updatePoint = async (req, res) => {
    try {
        const { id, pointId } = req.params;
        const { heading, description } = req.body;
        
        const sop = await SOP.findOneAndUpdate(
            { _id: id, "points._id": pointId },
            { $set: { "points.$.heading": heading, "points.$.description": description } },
            { new: true }
        );
        
        if (!sop) return res.status(404).json({ message: 'SOP or Point not found' });
        res.json(sop);
    } catch (error) {
        res.status(500).json({ message: 'Error updating point', error: error.message });
    }
};

exports.deletePoint = async (req, res) => {
    try {
        const { id, pointId } = req.params;
        
        const sop = await SOP.findByIdAndUpdate(
            id,
            { $pull: { points: { _id: pointId } } },
            { new: true }
        );
        
        if (!sop) return res.status(404).json({ message: 'SOP not found' });
        res.json(sop);
    } catch (error) {
        res.status(500).json({ message: 'Error deleting point', error: error.message });
    }
};
