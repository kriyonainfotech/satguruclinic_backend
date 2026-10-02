const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');

// POST /api/auth/login -> Login endpoint
router.post('/login', authController.login);

// POST /api/auth/register -> Admin/Team creation endpoint
router.post('/register', authMiddleware, authController.registerUser);

// GET /api/auth/users/:role -> Get users by role
router.get('/users/:role', authMiddleware, authController.getUsersByRole);

// PUT /api/auth/users/:id -> Update user
router.put('/users/:id', authMiddleware, authController.updateUser);

// PUT /api/auth/users/:id/password -> Change password
router.put('/users/:id/password', authMiddleware, authController.changeUserPassword);

// DELETE /api/auth/users/:id -> Delete user
router.delete('/users/:id', authMiddleware, authController.deleteUser);

// GET /api/auth/birthdays/today -> Today's birthdays
router.get('/birthdays/today', authMiddleware, authController.getTodayBirthdays);

// GET /api/auth/birthdays/all -> All users with birthDate (sorted by month+day)
router.get('/birthdays/all', authMiddleware, authController.getAllBirthdays);

module.exports = router;
