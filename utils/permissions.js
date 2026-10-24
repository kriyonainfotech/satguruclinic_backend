const RolePermission = require('../models/RolePermission');
const { PERMISSION_KEYS } = require('../config/permissionModules');

const getId = (user) => String(user.userId || user.id || user._id || '');

// Role default document: category khali aur kisi user ka nahi
const isRoleDefault = (d) => d.category === '' && !d.userId;

// Priority: user (naam) override -> role default (DB) -> hardcoded default
// Result me module aur "module:action" dono keys hoti hain (raw value, module on hai ya nahi ye hasPermission dekhta hai)
const resolvePermissions = (role, userId, docs) => {
    const roleDoc = docs.find(d => d.role === role && isRoleDefault(d));
    const userDoc = userId ? docs.find(d => d.role === role && d.userId && String(d.userId) === String(userId)) : null;

    const result = {};
    PERMISSION_KEYS.forEach(p => {
        if (role === 'superadmin') {
            result[p.key] = true;
        } else if (userDoc && userDoc.modules.has(p.key)) {
            result[p.key] = userDoc.modules.get(p.key);
        } else if (roleDoc && roleDoc.modules.has(p.key)) {
            result[p.key] = roleDoc.modules.get(p.key);
        } else {
            result[p.key] = !!(p.defaults && p.defaults[role]);
        }
    });
    return result;
};

const getUserPermissions = async (user) => {
    const role = user.role;
    const docs = role === 'superadmin' ? [] : await RolePermission.find({ role });
    return resolvePermissions(role, getId(user), docs);
};

// 'rule-management' ya 'rule-management:create' jaisi key check karta hai.
// Action key ke liye module bhi on hona chahiye.
const checkPermission = (permissions, key) => {
    const moduleKey = key.split(':')[0];
    if (!permissions[moduleKey]) return false;
    return !!permissions[key];
};

const hasPermission = async (user, key) => {
    if (user.role === 'superadmin') return true;
    return checkPermission(await getUserPermissions(user), key);
};

module.exports = { isRoleDefault, resolvePermissions, getUserPermissions, checkPermission, hasPermission };
