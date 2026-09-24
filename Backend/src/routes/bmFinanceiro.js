const express = require('express')
const router = express.Router()
const { requireRole } = require('../middleware/auth')
const { resumoMensal } = require('../controllers/bmFinanceiro')

// Todos menos o plantonista
const podeVerBm = requireRole('admin', 'anestesita_socio', 'tecnico')

router.get('/', podeVerBm, resumoMensal)

module.exports = router
