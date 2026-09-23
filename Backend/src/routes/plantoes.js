const express = require('express')
const router = express.Router()
const {
  createPlantao, listPlantoes, getPlantao, updatePlantao, addUsuarios, removeUsuario, definirCoordenador,
  criarTroca, listarTrocasDoPlantao, listarTrocasPendentes, responderTroca,
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
router.delete('/:id/usuarios/:usuarioId', removeUsuario)
router.get('/:id/trocas', listarTrocasDoPlantao)
router.post('/:id/trocas', criarTroca)

module.exports = router
