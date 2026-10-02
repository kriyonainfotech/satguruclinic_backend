const express = require('express');
const router = express.Router();
const taskController = require('../controllers/taskController');
const authMiddleware = require('../middleware/authMiddleware');

// All task endpoints are protected by authMiddleware
router.use(authMiddleware);

// GET /api/tasks/assignable-users -> Users who can receive tasks
router.get('/assignable-users', taskController.getAssignableUsers);

// GET /api/tasks -> Get tasks based on role and query parameters
router.get('/', taskController.getTasks);

// POST /api/tasks -> Create task
router.post('/', taskController.createTask);

// PUT /api/tasks/:id -> Update full task
router.put('/:id', taskController.updateTask);

// PATCH /api/tasks/:id/status -> Quick update status (Pending / In Progress / Completed)
router.patch('/:id/status', taskController.updateTaskStatus);

// DELETE /api/tasks/:id -> Delete task
router.delete('/:id', taskController.deleteTask);

module.exports = router;
