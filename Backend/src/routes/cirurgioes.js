const express = require('express')
const router = express.Router()
const { requireRole } = require('../middleware/auth')
const { listar, criar, atualizar } = require('../controllers/cirurgioes')

// Todos os usuários logados veem a lista (são as sugestões do caso fora); só o escritório e o técnico cadastram e alteram
const podeCadastrar = requireRole('escritorio', 'tecnico')

router.get('/', listar)
router.post('/', podeCadastrar, criar)
router.patch('/:id', podeCadastrar, atualizar)

module.exports = router
