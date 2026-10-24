const moment = require('moment');
const Attendance = require('../models/Attendance');

// Clock-in selfie photos sirf itne din rakhte hain (aaj ko mila ke), uske baad photo hata dete hain.
// Attendance record (clock in/out, status) waisa hi rehta hai, sirf photo delete hoti hai.
const PHOTO_KEEP_DAYS = 7;

// Vercel pe cron nahi hai, isliye attendance requests pe hi chalta hai, par har 6 ghante me ek hi baar
const RUN_EVERY_MS = 6 * 60 * 60 * 1000;
let lastRun = 0;

const deleteOldPhotos = async () => {
    // Jaise aaj 23 tarikh: 17 se 23 tak ki photos rehti hain, 16 aur usse purani hat jaati hain
    const cutoff = moment().subtract(PHOTO_KEEP_DAYS - 1, 'days').format('YYYY-MM-DD');
    const result = await Attendance.updateMany(
        {
            date: { $lt: cutoff },
            $or: [{ photo: { $exists: true } }, { 'shifts.photo': { $exists: true } }]
        },
        { $unset: { photo: '', 'shifts.$[].photo': '' } }
    );
    if (result.modifiedCount) {
        console.log(`Photo cleanup: ${result.modifiedCount} attendance records se ${cutoff} se purani photos hata di`);
    }
    return result.modifiedCount;
};

// Request ko kabhi fail nahi karta, cleanup me error aaye to sirf log hota hai
const runPhotoCleanup = async () => {
    if (Date.now() - lastRun < RUN_EVERY_MS) return;
    lastRun = Date.now();
    try {
        await deleteOldPhotos();
    } catch (err) {
        console.error('Photo cleanup failed:', err.message);
    }
};

module.exports = { PHOTO_KEEP_DAYS, deleteOldPhotos, runPhotoCleanup };
