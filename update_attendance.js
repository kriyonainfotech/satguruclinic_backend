const mongoose = require('mongoose');
require('dotenv').config();
const uri = process.env.MONGO_URI;
mongoose.connect(uri).then(async () => {
    const Attendance = require('./models/Attendance');
    await Attendance.updateOne({ 'status': 'half-day' }, { $set: { status: 'short-time' } });
    console.log('Done');
    process.exit(0);
});
