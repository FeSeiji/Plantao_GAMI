const express = require('express')
const router = express.Router()
const { login, refresh, register, me, atualizarMe, forgotPassword, resetPassword } = require('../controllers/authController')
const { authMiddleware } = require('../middleware/auth')

router.post('/login', login)
router.post('/refresh', refresh)
router.post('/register', register)
router.post('/forgot-password', forgotPassword)
router.post('/reset-password', resetPassword)
router.get('/me', authMiddleware, me)
router.patch('/me', authMiddleware, atualizarMe)

module.exports = router