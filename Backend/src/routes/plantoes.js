const express = require('express')
const router = express.Router()
const { requireRole } = require('../middleware/auth')
const {
  createPlantao, listPlantoes, getPlantao, updatePlantao, addUsuarios, removeUsuario,
  criarTroca, listarTrocasDoPlantao, listarTrocasPendentes, responderTroca, listarRemocoesDoPlantao,
  alterarPosicao, listarMudancasPosicaoDoPlantao, cancelarTroca,
} = require('../controllers/plantoes')

// Criar e editar o plantão e mexer na equipe (adicionar, remover) é da gestão.
// Os médicos usam a troca, que pede aceite; sócios com a flag admin entram por 'admin'
const gestao = requireRole('escritorio', 'admin', 'tecnico')
// Mudar posições: gestão e os próprios sócios (estes só na fila de sócio, conferido no controller).
// No plantonista, mudar de vaga é também como se define o coordenador
const mudarPosicao = requireRole('escritorio', 'admin', 'anestesita_socio', 'tecnico')

router.get('/', listPlantoes)
router.get('/trocas/pendentes', listarTrocasPendentes)
router.patch('/trocas/:trocaId/aceitar', responderTroca(true))
router.patch('/trocas/:trocaId/recusar', responderTroca(false))
router.get('/:id', getPlantao)
router.post('/', gestao, createPlantao)
router.patch('/:id', gestao, updatePlantao)
router.post('/:id/usuarios', gestao, addUsuarios)
router.patch('/:id/posicao', mudarPosicao, alterarPosicao)
router.delete('/:id/usuarios/:usuarioId', gestao, removeUsuario)
router.get('/:id/trocas', listarTrocasDoPlantao)
router.get('/:id/remocoes', listarRemocoesDoPlantao)
router.get('/:id/mudancas-posicao', listarMudancasPosicaoDoPlantao)
router.post('/:id/trocas', criarTroca)
// Pedido pendente: quem pediu ou a gestão. Troca por horas já aceita: só a gestão (conferido no controller)
router.patch('/:id/trocas/:trocaId/cancelar', cancelarTroca)

module.exports = router
