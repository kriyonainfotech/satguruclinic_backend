const mongoose = require('mongoose');
require('dotenv').config();
mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/satguruclinic').then(async () => {
    const Lead = require('./models/Lead');
    const lead = await Lead.findOne({ fullName: 'kirtan narola' });
    if (lead) {
        lead.birthdate = new Date('2026-10-10');
        await lead.save();
        console.log('Saved birthdate for kirtan narola');
    }
    process.exit(0);
});
