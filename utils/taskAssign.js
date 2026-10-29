const TaskAssignRule = require('../models/TaskAssignRule');

// Task assign permission: kaun (row) kisko (column) task de sakta hai.
// Superadmin pe koi rule nahi (sabko de sakta hai), aur superadmin ko koi nahi de sakta. Khud ko hamesha de sakte hain.
// NOTE: frontend/src/components/TaskAssignCard.jsx me bhi same levels aur defaults hain, dono sync rakhna.
const ASSIGN_LEVELS = ['admin', 'senior', 'junior'];

// Defaults = pehle jo hardcoded rules the
const DEFAULT_ASSIGN_MATRIX = {
    admin: { admin: false, senior: true, junior: true },
    senior: { admin: false, senior: false, junior: true },
    junior: { admin: false, senior: false, junior: false }
};

// User ka level: admin, senior, ya junior (team member jo senior nahi)
const levelOf = (user) => {
    if (user.role === 'admin') return 'admin';
    if (user.role === 'team') return user.teamLevel === 'senior' ? 'senior' : 'junior';
    return null;
};

// Saved matrix + defaults (jo cell save nahi hua wo default se)
const normalizeMatrix = (saved = {}) => {
    const result = {};
    ASSIGN_LEVELS.forEach(from => {
        result[from] = {};
        ASSIGN_LEVELS.forEach(to => {
            const v = saved?.[from]?.[to];
            result[from][to] = typeof v === 'boolean' ? v : DEFAULT_ASSIGN_MATRIX[from][to];
        });
    });
    return result;
};

const getAssignMatrix = async () => {
    const doc = await TaskAssignRule.findOne();
    return normalizeMatrix(doc ? doc.matrix : {});
};

// assigner target ko task de sakta hai?
const canAssignByMatrix = (matrix, assigner, target) => {
    if (assigner.role === 'superadmin') return true;
    const assignerId = String(assigner.userId || assigner._id);
    if (String(target._id) === assignerId) return true;
    if (target.role === 'superadmin') return false;
    const from = levelOf(assigner);
    const to = levelOf(target);
    return !!(from && to && matrix[from][to]);
};

// Is user ki row default se alag hai? (Tasks page tab custom dropdown dikhata hai)
const isRowCustom = (matrix, user) => {
    const from = levelOf(user);
    if (!from) return false;
    return ASSIGN_LEVELS.some(to => matrix[from][to] !== DEFAULT_ASSIGN_MATRIX[from][to]);
};

module.exports = { ASSIGN_LEVELS, DEFAULT_ASSIGN_MATRIX, levelOf, normalizeMatrix, getAssignMatrix, canAssignByMatrix, isRowCustom };
