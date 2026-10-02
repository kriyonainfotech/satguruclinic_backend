const User = require('../models/User');
const bcrypt = require('bcryptjs');

// Ye function server start hone par check karega ki Super Admin exist karta hai ya nahi.
// Agar nahi karta, toh automatically create kar dega.
const initSuperAdmin = async () => {
    try {
        const superAdminEmail = 'satguruclinic@superadmin.com';
        const existingAdmin = await User.findOne({ email: superAdminEmail });

        if (!existingAdmin) {
            console.log('Super Admin not found. Creating one...');
            // Password ko encrypt karna zaroori hai security ke liye
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash('SGCsuperadmin@123', salt);

            const superAdmin = new User({
                name: 'Super Admin',
                email: superAdminEmail,
                password: hashedPassword,
                role: 'superadmin'
            });

            await superAdmin.save();
            console.log('Super Admin created successfully!');
        } else {
            console.log('Super Admin already exists in the database.');
        }
    } catch (error) {
        console.error('Error creating super admin:', error);
    }
};

module.exports = initSuperAdmin;
