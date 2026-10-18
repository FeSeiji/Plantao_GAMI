const express = require('express')
const router = express.Router()
const { requireRole } = require('../middleware/auth')
const { resumoMensal } = require('../controllers/bmFinanceiro')

// Só administradores (a flag is_admin)
const podeVerBm = requireRole('admin')

router.get('/', podeVerBm, resumoMensal)

module.exports = router
