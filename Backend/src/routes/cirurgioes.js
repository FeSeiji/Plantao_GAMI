const express = require('express')
const router = express.Router()
const { requireRole } = require('../middleware/auth')
const { listar, criar, atualizar } = require('../controllers/cirurgioes')

// Todos os usuários logados veem a lista (são as sugestões do caso fora); só o escritório cadastra e altera
const escritorio = requireRole('escritorio')

router.get('/', listar)
router.post('/', escritorio, criar)
router.patch('/:id', escritorio, atualizar)

module.exports = router
