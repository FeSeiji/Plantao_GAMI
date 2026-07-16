const express = require('express')
const router = express.Router()
const { login, register, me, forgotPassword, resetPassword } = require('../controllers/authController')
const { authMiddleware } = require('../middleware/auth')

router.post('/login', login)
router.post('/register', register)
router.post('/forgot-password', forgotPassword)
router.post('/reset-password', resetPassword)
router.get('/me', authMiddleware, me)

module.exports = router