const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();

// Middleware - allow up to 15mb for base64 live photo clock-in uploads
app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ limit: '15mb', extended: true }));

// Database initialization
const initSuperAdmin = require('./utils/initSuperAdmin');

// Vercel Serverless MongoDB Connection
let isConnected = false;

const connectDB = async () => {
  if (mongoose.connection.readyState === 1) {
    return;
  }
  
  if (mongoose.connection.readyState === 2) {
    // Waiting for existing connection
    let waited = 0;
    while (mongoose.connection.readyState === 2 && waited < 4000) {
      await new Promise(r => setTimeout(r, 100));
      waited += 100;
    }
    if (mongoose.connection.readyState === 1) return;
  }

  try {
    const db = await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 8000,
      maxPoolSize: 10
    });
    isConnected = db.connections[0].readyState === 1;
    console.log('MongoDB Connected (Vercel Serverless)');
    initSuperAdmin();
  } catch (err) {
    console.error('MongoDB connection error:', err);
    throw err;
  }
};

// Start connection process in global scope so it boots with the container
connectDB().catch(err => console.error('Initial DB connect attempt error:', err));

// Middleware to ensure DB connection is active for every serverless request
app.use(async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      await connectDB();
    }
    next();
  } catch (error) {
    console.error('Database connection middleware failed:', error);
    res.status(500).json({ message: 'Database connection failed. Please try again.', error: error.message });
  }
});

// Routes
const patientRoutes = require('./routes/patientRoutes');
const authRoutes = require('./routes/authRoutes');
const taskRoutes = require('./routes/taskRoutes');
const appointmentRoutes = require('./routes/appointmentRoutes');
const settingRoutes = require('./routes/settingRoutes');
const checklistRoutes = require('./routes/checklistRoutes');
const serviceRoutes = require('./routes/serviceRoutes');
const medicineRoutes = require('./routes/medicineRoutes');
const packageRoutes = require('./routes/packageRoutes');
const sopRoutes = require('./routes/sopRoutes');
const ruleRoutes = require('./routes/ruleRoutes');

app.use('/api/patients', patientRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/settings', settingRoutes);
app.use('/api/checklists', checklistRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/medicines', medicineRoutes);
app.use('/api/packages', packageRoutes);
app.use('/api/sops', sopRoutes);
app.use('/api/rules', ruleRoutes);
app.use('/api/attendance', require('./routes/attendanceRoutes'));
app.use('/api/payroll', require('./routes/payrollRoutes'));
app.use('/api/calls', require('./routes/callLogs'));
app.use('/api/holidays', require('./routes/holidayRoutes'));
app.use('/api/invoices', require('./routes/invoiceRoutes'));
app.use('/api/collections', require('./routes/collectionRoutes'));
app.use('/api/expense-categories', require('./routes/expenseCategoryRoutes'));
app.use('/api/expenses', require('./routes/expenseRoutes'));
app.use('/api/dashboard', require('./routes/dashboardRoutes'));
app.use('/api/leads', require('./routes/leadRoutes'));
app.use('/api/calendar', require('./routes/calendarRoutes'));
app.use('/api/daily-reports', require('./routes/dailyReportRoutes'));
app.use('/api/permissions', require('./routes/permissionRoutes'));
app.use('/api/complaints', require('./routes/complaintRoutes'));
app.use('/api/pharmacy-bills', require('./routes/pharmacyBillRoutes'));
app.use('/api/opening-balance', require('./routes/openingBalanceRoutes'));

app.get('/', (req, res) => {
    res.send('Satguru Clinic Backend is running!');
});

const PORT = process.env.PORT || 5000;
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}
module.exports = app;
