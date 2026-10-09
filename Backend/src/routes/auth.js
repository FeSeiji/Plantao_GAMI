const express = require('express')
const router = express.Router()
const { login, refresh, register, me, atualizarMe, forgotPassword, resetPassword } = require('../controllers/authController')
const { authMiddleware } = require('../middleware/auth')
const { limiteLoginPorConta, limiteLoginPorIp, limiteEsqueciSenha, limiteCadastro } = require('../middleware/rateLimit')

router.post('/login', limiteLoginPorIp, limiteLoginPorConta, login)
router.post('/refresh', refresh)
router.post('/register', limiteCadastro, register)
router.post('/forgot-password', limiteEsqueciSenha, forgotPassword)
router.post('/reset-password', resetPassword)
router.get('/me', authMiddleware, me)
router.patch('/me', authMiddleware, atualizarMe)

module.exports = router