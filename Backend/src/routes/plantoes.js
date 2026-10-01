const express = require('express')
const router = express.Router()
const { requireRole } = require('../middleware/auth')
const {
  createPlantao, listPlantoes, getPlantao, updatePlantao, addUsuarios, removeUsuario, definirCoordenador,
  criarTroca, listarTrocasDoPlantao, listarTrocasPendentes, responderTroca, listarRemocoesDoPlantao,
  alterarPosicao, listarMudancasPosicaoDoPlantao,
} = require('../controllers/plantoes')

router.get('/', listPlantoes)
router.get('/trocas/pendentes', listarTrocasPendentes)
router.patch('/trocas/:trocaId/aceitar', responderTroca(true))
router.patch('/trocas/:trocaId/recusar', responderTroca(false))
router.get('/:id', getPlantao)
router.post('/', createPlantao)
router.patch('/:id', updatePlantao)
router.post('/:id/usuarios', addUsuarios)
router.patch('/:id/coordenador', definirCoordenador)
router.patch('/:id/posicao', requireRole('admin', 'anestesita_socio', 'tecnico'), alterarPosicao)
router.delete('/:id/usuarios/:usuarioId', removeUsuario)
router.get('/:id/trocas', listarTrocasDoPlantao)
router.get('/:id/remocoes', listarRemocoesDoPlantao)
router.get('/:id/mudancas-posicao', listarMudancasPosicaoDoPlantao)
router.post('/:id/trocas', criarTroca)

module.exports = router
