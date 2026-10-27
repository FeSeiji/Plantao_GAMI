const express = require('express')
const router = express.Router()
const { requireRole } = require('../middleware/auth')
const {
  resumoMensal, exportar, salvarFinanceiro, criarItemDespesa, atualizarItemDespesa,
} = require('../controllers/bmFinanceiro')
const { criar, atualizar, excluir } = require('../controllers/ajustesPontos')

// Administradores (a flag is_admin), técnicos, todos os sócios e quem tem acesso ao BM veem o BM
const podeVerBm = requireRole('admin', 'tecnico', 'anestesita_socio', 'bm_access')
// Editar (financeiro e ajustes de pontos): só quem tem a flag bm_access, que o admin concede
const podeEditarBm = requireRole('bm_access')

router.get('/', podeVerBm, resumoMensal)
router.get('/exportar', podeVerBm, exportar)
router.put('/financeiro', podeEditarBm, salvarFinanceiro)
router.post('/despesa-itens', podeEditarBm, criarItemDespesa)
router.patch('/despesa-itens/:id', podeEditarBm, atualizarItemDespesa)
router.post('/ajustes', podeEditarBm, criar)
router.patch('/ajustes/:id', podeEditarBm, atualizar)
router.delete('/ajustes/:id', podeEditarBm, excluir)

module.exports = router
