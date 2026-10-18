const express = require('express')
const router = express.Router()
const { requireRole } = require('../middleware/auth')
const { listar, criar, atualizar } = require('../controllers/hospitais')

// Todos os usuários logados veem a lista (é o dropdown do caso fora e da ficha); só a gestão cadastra e altera
const gestao = requireRole('escritorio', 'tecnico', 'admin')

router.get('/', listar)
router.post('/', gestao, criar)
router.patch('/:id', gestao, atualizar)

module.exports = router
