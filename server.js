const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
const patientRoutes = require('./routes/patientRoutes');
const authRoutes = require('./routes/authRoutes');
const taskRoutes = require('./routes/taskRoutes');
const appointmentRoutes = require('./routes/appointmentRoutes');
const settingRoutes = require('./routes/settingRoutes');
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
app.use('/api/expenses', require('./routes/expenseRoutes'));

// Database initialization
const initSuperAdmin = require('./utils/initSuperAdmin');

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
.then(() => {
    console.log('MongoDB Connected to satguruclinic');
    initSuperAdmin(); // Jaise hi DB connect hoga, ye check karega aur superadmin banayega
})
.catch(err => console.log('MongoDB connection error:', err));

app.get('/', (req, res) => {
    res.send('Satguru Clinic Backend is running!');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
module.exports = app;
