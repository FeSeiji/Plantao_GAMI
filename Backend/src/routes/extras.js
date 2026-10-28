const express = require('express')
const router = express.Router()
const { requireRole } = require('../middleware/auth')
const { exigirUuid } = require('../middleware/parametros')
const { listar, criar, atualizar, remover } = require('../controllers/extras')

// Plantão extra: todos os usuários logados veem (calendário); só a gestão cria, edita e exclui
const gestao = requireRole('escritorio', 'admin', 'tecnico')

// Ids de rota fora do formato uuid: 404, em vez do erro de sintaxe do banco
exigirUuid(router, 'id')

router.get('/', listar)
router.post('/', gestao, criar)
router.patch('/:id', gestao, atualizar)
router.delete('/:id', gestao, remover)

module.exports = router
