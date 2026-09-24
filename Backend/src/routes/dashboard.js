const express = require('express')
const router = express.Router()
const { requireRole } = require('../middleware/auth')
const { resumo, gestao } = require('../controllers/dashboard')

// Aberto a qualquer usuário logado — só devolve os dados do próprio usuário
router.get('/', resumo)
// Visão do hospital inteiro — só admin e técnico
router.get('/gestao', requireRole('admin', 'tecnico'), gestao)

module.exports = router
