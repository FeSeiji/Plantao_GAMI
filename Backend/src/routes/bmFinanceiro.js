const express = require('express')
const router = express.Router()
const { requireRole } = require('../middleware/auth')
const { resumoMensal } = require('../controllers/bmFinanceiro')

// Administradores (a flag is_admin) e técnicos
const podeVerBm = requireRole('admin', 'tecnico')

router.get('/', podeVerBm, resumoMensal)

module.exports = router
