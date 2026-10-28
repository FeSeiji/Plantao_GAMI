const express = require('express')
const router = express.Router()
const { requireRole } = require('../middleware/auth')
const { exigirUuid } = require('../middleware/parametros')
const { listar, criar, atualizar } = require('../controllers/cirurgioes')

// Todos os usuários logados veem a lista (são as sugestões do caso fora); só o escritório e o técnico cadastram e alteram
const podeCadastrar = requireRole('escritorio', 'tecnico')

// Ids de rota fora do formato uuid: 404, em vez do erro de sintaxe do banco
exigirUuid(router, 'id')

router.get('/', listar)
router.post('/', podeCadastrar, criar)
router.patch('/:id', podeCadastrar, atualizar)

module.exports = router
