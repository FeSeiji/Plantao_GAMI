const express = require('express')
const router = express.Router()
const { requireRole } = require('../middleware/auth')
const {
  listarMeus, listarDoUsuario, listarPendentes, listarTodos, criar, criarParaMedico, remover, responder, definirTipoCongresso,
} = require('../controllers/afastamentos')

const gestao = requireRole('escritorio', 'admin', 'tecnico')

// Férias e congressos: o médico pede, a gestão aprova ou recusa. Só o aprovado bloqueia a escala.
router.get('/', gestao, listarTodos)
router.get('/me', listarMeus)
router.get('/pendentes', gestao, listarPendentes)
router.get('/usuario/:usuarioId', gestao, listarDoUsuario)
// A gestão cadastra para qualquer médico: já aprovado, e pode ser no passado
router.post('/usuario/:usuarioId', gestao, criarParaMedico)
router.post('/', criar)
router.patch('/:id/aprovar', gestao, responder(true))
router.patch('/:id/recusar', gestao, responder(false))
// Tipo do congresso: o próprio médico (sem tipo ou pendente) ou a gestão (conferido no controller)
router.patch('/:id/tipo-congresso', definirTipoCongresso)
// O próprio médico (pedido pendente ou recusado) ou a gestão (qualquer um)
router.delete('/:id', remover)

module.exports = router
