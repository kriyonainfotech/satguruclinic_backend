const mongoose = require('mongoose');

const dailyReportSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    employeeName: {
        type: String,
        required: true
    },
    category: {
        type: String,
        default: ''
    },
    date: {
        type: String, // YYYY-MM-DD
        required: true
    },
    adminId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },

    // 2. Attendance & Timing
    attendanceTiming: {
        morningInTime: { type: String, default: '' },
        afternoonOutTime: { type: String, default: '' },
        afternoonInTime: { type: String, default: '' },
        eveningOutTime: { type: String, default: '' }
    },

    // 3. Target & Sales (Target vs Achieved)
    targetSales: {
        monthlyTarget: { type: Number, default: 0 },
        monthlySales: { type: Number, default: 0 },
        weeklyTarget: { type: Number, default: 0 },
        weeklySales: { type: Number, default: 0 },
        todayTarget: { type: Number, default: 0 },
        todaySales: { type: Number, default: 0 },
        crossSelling: { type: Number, default: 0 },
        cosmeticSales: { type: Number, default: 0 },
        totalExpenses: { type: Number, default: 0 },
        todayExpenses: { type: Number, default: 0 }
    },

    // 4. Calling & Leads (Total / Target vs Achieved)
    callingLeads: {
        totalCallingTarget: { type: Number, default: 0 },
        totalCallingDone: { type: Number, default: 0 },
        todayCalling: { type: Number, default: 0 },
        totalLeads: { type: Number, default: 0 },
        todayLeads: { type: Number, default: 0 },
        followupCalls: { type: Number, default: 0 },
        convertedLeadsTotal: { type: Number, default: 0 },
        convertedLeadsToday: { type: Number, default: 0 },
        phoneLeads: { type: Number, default: 0 },
        metaLeads: { type: Number, default: 0 },
        mediumCalls: { type: Number, default: 0 },
        googleReviewsTarget: { type: Number, default: 0 },
        googleReviewsDone: { type: Number, default: 0 }
    },

    // 5. Patient Details
    patientDetails: {
        todayTotalPatients: { type: Number, default: 0 },
        totalDonePatients: { type: Number, default: 0 },
        todayDonePatients: { type: Number, default: 0 },
        monthlyPatients: { type: Number, default: 0 },
        patientVisits: { type: Number, default: 0 },
        lhrPatients: { type: Number, default: 0 },
        cosmeticPatients: { type: Number, default: 0 },
        followupPatients: { type: Number, default: 0 }
    },

    // 6. Task Management (Target vs Done)
    taskManagement: {
        totalTasks: { type: Number, default: 0 },
        completedTasks: { type: Number, default: 0 },
        taskSheetSubmitted: { type: String, enum: ['Yes', 'No', ''], default: 'No' },
        softwareMessagesTotal: { type: Number, default: 0 },
        softwareMessagesDone: { type: Number, default: 0 },
        reviewTargetTotal: { type: Number, default: 0 },
        reviewTargetDone: { type: Number, default: 0 },
        billPaymentTotal: { type: Number, default: 0 },
        billPaymentDone: { type: Number, default: 0 }
    },

    // 7. Clinic & Staff Compliance
    compliance: {
        grooming: { type: String, enum: ['Yes', 'No', ''], default: 'Yes' },
        oathCompleted: { type: String, enum: ['Yes', 'No', 'NA', ''], default: 'Yes' },
        mrCount: { type: Number, default: 0 },
        errorReported: { type: String, enum: ['Yes', 'No', ''], default: 'No' },
        totalErrors: { type: Number, default: 0 },
        solvedErrors: { type: Number, default: 0 }
    },

    // 8. Follow-up & Pending Work
    followupPending: {
        julyFollowups: { type: Number, default: 0 },
        augustFollowups: { type: Number, default: 0 },
        septemberFollowups: { type: Number, default: 0 },
        octoberFollowups: { type: Number, default: 0 },
        otherPendingFollowups: { type: Number, default: 0 },
        reasonPending: { type: String, default: '' },
        todayActionPlan: { type: String, default: '' },
        tomorrowActionPlan: { type: String, default: '' },
        remarks: { type: String, default: '' }
    }
}, { timestamps: true });

// Ensure one report per user per date
dailyReportSchema.index({ userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('DailyReport', dailyReportSchema);
