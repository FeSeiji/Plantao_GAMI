const express = require('express')
const router = express.Router()
const { requireRole } = require('../middleware/auth')
const { exigirUuid } = require('../middleware/parametros')
const {
  createPlantao, listPlantoes, getPlantao, updatePlantao, addUsuarios, removerDaVaga,
  criarTroca, listarTrocasDoPlantao, listarTrocasPendentes, responderTroca, listarRemocoesDoPlantao,
  listarAvisosTroca, marcarAvisoTrocaCiente,
  alterarPosicao, listarMudancasPosicaoDoPlantao, cancelarTroca,
  pedirVaga, listarPedidosVagaDoPlantao, listarPedidosVagaPendentes, responderPedidoVaga, cancelarPedidoVaga,
  subirEscala, desfazerSubidaDaVaga,
} = require('../controllers/plantoes')

// Criar e editar o plantão e preencher ou esvaziar vagas é da gestão.
// Os médicos usam a troca, que pede aceite; sócios com a flag admin entram por 'admin'
const gestao = requireRole('escritorio', 'admin', 'tecnico')
// Mudar médicos de vaga: a gestão muda qualquer uma; o médico, só a própria, para uma vaga vazia e até o turno
// terminar (conferido no controller)
const mudarPosicao = requireRole('escritorio', 'admin', 'anestesita_socio', 'anestesita_socio_jr', 'anestesita_plantonista', 'tecnico')
// Pedir uma vaga livre: só médicos (a gestão aprova ou recusa)
const medicos = requireRole('anestesita_socio', 'anestesita_socio_jr', 'anestesita_plantonista')

// Ids de rota fora do formato uuid: 404, em vez do erro de sintaxe do banco
exigirUuid(router, 'id', 'trocaId', 'avisoId', 'pedidoId')

router.get('/', listPlantoes)
router.get('/trocas/pendentes', listarTrocasPendentes)
router.patch('/trocas/:trocaId/aceitar', responderTroca(true))
router.patch('/trocas/:trocaId/recusar', responderTroca(false))
// Avisos das trocas que a gestão registrou (cada um vê só os seus)
router.get('/trocas/avisos', listarAvisosTroca)
router.patch('/trocas/avisos/:avisoId/ciente', marcarAvisoTrocaCiente)
router.get('/pedidos-vaga/pendentes', gestao, listarPedidosVagaPendentes)
router.patch('/pedidos-vaga/:pedidoId/aprovar', gestao, responderPedidoVaga(true))
router.patch('/pedidos-vaga/:pedidoId/recusar', gestao, responderPedidoVaga(false))
// Quem pediu ou a gestão (conferido no controller)
router.patch('/pedidos-vaga/:pedidoId/cancelar', cancelarPedidoVaga)
router.get('/:id', getPlantao)
router.post('/', gestao, createPlantao)
router.patch('/:id', gestao, updatePlantao)
router.post('/:id/usuarios', gestao, addUsuarios)
router.patch('/:id/posicao', mudarPosicao, alterarPosicao)
router.delete('/:id/vagas/:posicao', gestao, removerDaVaga)
// Subida de escala na vaga de quem está de férias sem cobertura: só a gestão
router.post('/:id/subidas', gestao, subirEscala)
router.delete('/:id/subidas/:posicao', gestao, desfazerSubidaDaVaga)
router.get('/:id/trocas', listarTrocasDoPlantao)
router.get('/:id/remocoes', listarRemocoesDoPlantao)
router.get('/:id/mudancas-posicao', listarMudancasPosicaoDoPlantao)
router.post('/:id/trocas', criarTroca)
// Pedido pendente: quem pediu ou a gestão. Troca por horas já aceita: só a gestão (conferido no controller)
router.patch('/:id/trocas/:trocaId/cancelar', cancelarTroca)
router.get('/:id/pedidos-vaga', listarPedidosVagaDoPlantao)
router.post('/:id/pedidos-vaga', medicos, pedirVaga)

module.exports = router
