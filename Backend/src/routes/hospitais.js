const express = require('express')
const router = express.Router()
const { requireRole } = require('../middleware/auth')
const { exigirUuid } = require('../middleware/parametros')
const { listar, criar, atualizar } = require('../controllers/hospitais')

// Todos os usuários logados veem a lista (é o dropdown do caso fora); só a gestão cadastra e altera
const gestao = requireRole('escritorio', 'tecnico', 'admin')

// Ids de rota fora do formato uuid: 404, em vez do erro de sintaxe do banco
exigirUuid(router, 'id')

router.get('/', listar)
router.post('/', gestao, criar)
router.patch('/:id', gestao, atualizar)

module.exports = router
