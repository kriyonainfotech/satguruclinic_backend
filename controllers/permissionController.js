const mongoose = require('mongoose');
const RolePermission = require('../models/RolePermission');
const User = require('../models/User');
const { PERMISSION_MODULES, PERMISSION_ROLES, PERMISSION_KEYS } = require('../config/permissionModules');
const { isRoleDefault, getUserPermissions } = require('../utils/permissions');

// Logged-in user ko kaunse modules dikhne chahiye
exports.getMyPermissions = async (req, res) => {
    try {
        const modules = await getUserPermissions(req.user);
        res.status(200).json({ role: req.user.role, modules });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// body ka userId check: khali = role default, warna usi role ka valid user hona chahiye
const readTargetUser = async (role, rawUserId) => {
    if (!rawUserId) return { userId: null };
    if (!mongoose.Types.ObjectId.isValid(rawUserId)) return { error: 'Invalid user' };
    const user = await User.findById(rawUserId).select('role');
    if (!user || user.role !== role) return { error: 'User not found in this role' };
    return { userId: user._id };
};

// Superadmin: modules list + admin/team users + saare saved overrides (role default + naam wise)
exports.getAllPermissions = async (req, res) => {
    try {
        if (req.user.role !== 'superadmin') {
            return res.status(403).json({ message: 'Only superadmin can view role permissions' });
        }
        const [docs, users] = await Promise.all([
            RolePermission.find(),
            User.find({ role: { $in: PERMISSION_ROLES } }).select('name role category').sort({ name: 1 })
        ]);
        res.status(200).json({
            modules: PERMISSION_MODULES,
            roles: PERMISSION_ROLES,
            users: users.map(u => ({ _id: u._id, name: u.name, role: u.role, category: u.category || '' })),
            // Purane category-wise documents ab use nahi hote, isliye nahi bhejte
            overrides: docs
                .filter(d => isRoleDefault(d) || d.userId)
                .map(d => ({
                    role: d.role,
                    userId: d.userId ? String(d.userId) : '',
                    modules: Object.fromEntries(d.modules)
                }))
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Superadmin: kisi role (ya us role ke ek user) ke modules save karna
// body: { role, userId?, modules: { key: bool } }  (key = module ya 'module:action')
exports.updatePermissions = async (req, res) => {
    try {
        if (req.user.role !== 'superadmin') {
            return res.status(403).json({ message: 'Only superadmin can update role permissions' });
        }
        const { role, modules } = req.body;

        if (!PERMISSION_ROLES.includes(role)) {
            return res.status(400).json({ message: 'Invalid role' });
        }
        if (!modules || typeof modules !== 'object') {
            return res.status(400).json({ message: 'modules object is required' });
        }
        const { userId, error } = await readTargetUser(role, req.body.userId);
        if (error) return res.status(400).json({ message: error });

        const clean = {};
        PERMISSION_KEYS.forEach(p => {
            if (typeof modules[p.key] === 'boolean') clean[p.key] = modules[p.key];
        });

        const doc = await RolePermission.findOneAndUpdate(
            { role, category: '', userId },
            { $set: { modules: clean } },
            { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
        );
        res.status(200).json({ role: doc.role, userId: doc.userId ? String(doc.userId) : '', modules: Object.fromEntries(doc.modules) });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Superadmin: user ka override hata ke wapas role default pe le jaana
// (userId khali ho to role default hat ke hardcoded default lagta hai)
exports.resetPermissions = async (req, res) => {
    try {
        if (req.user.role !== 'superadmin') {
            return res.status(403).json({ message: 'Only superadmin can reset role permissions' });
        }
        const { role } = req.body;
        if (!PERMISSION_ROLES.includes(role)) {
            return res.status(400).json({ message: 'Invalid role' });
        }
        const { userId, error } = await readTargetUser(role, req.body.userId);
        if (error) return res.status(400).json({ message: error });

        await RolePermission.deleteOne({ role, category: '', userId });
        res.status(200).json({ message: 'Permissions reset to default' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
