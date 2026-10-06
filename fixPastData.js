const mongoose = require('mongoose');
const Appointment = require('./models/Appointment');
require('dotenv').config();

async function fixPastData() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const result = await Appointment.updateMany(
            { hasSaleEntry: true, status: { $ne: 'Completed' } },
            { $set: { status: 'Completed' } }
        );
        console.log(`Updated ${result.modifiedCount} old appointments to Completed.`);
    } catch (err) {
        console.error("Error:", err);
    } finally {
        mongoose.disconnect();
    }
}
fixPastData();
