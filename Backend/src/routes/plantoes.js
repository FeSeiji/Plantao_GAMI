const express = require('express')
const router = express.Router()
const { requireRole } = require('../middleware/auth')
const {
  createPlantao, listPlantoes, getPlantao, updatePlantao, addUsuarios, removeUsuario, definirCoordenador,
  criarTroca, listarTrocasDoPlantao, listarTrocasPendentes, responderTroca, listarRemocoesDoPlantao,
  alterarPosicao, listarMudancasPosicaoDoPlantao,
} = require('../controllers/plantoes')

// Mexer na equipe (adicionar, remover, coordenador) é da gestão; os médicos usam a troca, que pede aceite
const gestaoEquipe = requireRole('admin', 'tecnico')
// Criar e editar o plantão (data, horário, título) e mudar a ordem da fila
const edicaoPlantao = requireRole('admin', 'anestesita_socio', 'tecnico')

router.get('/', listPlantoes)
router.get('/trocas/pendentes', listarTrocasPendentes)
router.patch('/trocas/:trocaId/aceitar', responderTroca(true))
router.patch('/trocas/:trocaId/recusar', responderTroca(false))
router.get('/:id', getPlantao)
router.post('/', edicaoPlantao, createPlantao)
router.patch('/:id', edicaoPlantao, updatePlantao)
router.post('/:id/usuarios', gestaoEquipe, addUsuarios)
router.patch('/:id/coordenador', gestaoEquipe, definirCoordenador)
router.patch('/:id/posicao', edicaoPlantao, alterarPosicao)
router.delete('/:id/usuarios/:usuarioId', gestaoEquipe, removeUsuario)
router.get('/:id/trocas', listarTrocasDoPlantao)
router.get('/:id/remocoes', listarRemocoesDoPlantao)
router.get('/:id/mudancas-posicao', listarMudancasPosicaoDoPlantao)
router.post('/:id/trocas', criarTroca)

module.exports = router
