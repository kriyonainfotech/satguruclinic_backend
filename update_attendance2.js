const mongoose = require('mongoose');
require('dotenv').config();
const uri = process.env.MONGO_URI;
mongoose.connect(uri).then(async () => {
    const Attendance = require('./models/Attendance');
    const r = await Attendance.updateMany({ 'status': 'half-day' }, { $set: { status: 'short-time' } });
    console.log(r);
    process.exit(0);
});
