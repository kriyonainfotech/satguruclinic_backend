const mongoose = require('mongoose');

// Ek document = ek role (aur optional user) ke liye sidebar modules ka on/off.
// userId null ka matlab us role ke saare log (role default).
// Kisi user ka document ho to wo role default ko override karta hai.
// (category field purane category-wise documents ke liye hai, ab use nahi hota)
const rolePermissionSchema = new mongoose.Schema({
    role: {
        type: String,
        enum: ['admin', 'team'],
        required: true
    },
    category: {
        type: String,
        default: ''
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    modules: {
        type: Map,
        of: Boolean,
        default: {}
    }
}, { timestamps: true });

rolePermissionSchema.index({ role: 1, category: 1, userId: 1 }, { unique: true });

const RolePermission = mongoose.model('RolePermission', rolePermissionSchema);

// Purana { role, category } unique index hata ke naya lagao, warna ek role ke do users ka document save nahi hoga
RolePermission.syncIndexes().catch(err => console.error('RolePermission index sync failed:', err.message));

module.exports = RolePermission;
