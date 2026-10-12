const express = require('express')
const router = express.Router()
const { requireRole } = require('../middleware/auth')
const { listarMeus, listarDoUsuario, listarPendentes, criar, remover, responder } = require('../controllers/afastamentos')

const gestao = requireRole('escritorio', 'admin', 'tecnico')

// Férias e congressos: o médico pede, a gestão aprova ou recusa. Só o aprovado bloqueia a escala.
router.get('/me', listarMeus)
router.get('/pendentes', gestao, listarPendentes)
router.get('/usuario/:usuarioId', gestao, listarDoUsuario)
router.post('/', criar)
router.patch('/:id/aprovar', gestao, responder(true))
router.patch('/:id/recusar', gestao, responder(false))
// O próprio médico (pedido pendente ou recusado) ou a gestão (qualquer um)
router.delete('/:id', remover)

module.exports = router
