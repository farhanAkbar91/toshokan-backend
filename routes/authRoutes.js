const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Route POST /api/auth/login
router.post('/login', authController.login);

// Route POST /api/auth/register
router.post('/register', authController.register);

module.exports = router;
