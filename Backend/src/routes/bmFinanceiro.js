const express = require('express')
const router = express.Router()
const { requireRole } = require('../middleware/auth')
const { resumoMensal } = require('../controllers/bmFinanceiro')
const { criar, atualizar, excluir } = require('../controllers/ajustesPontos')

// Administradores (a flag is_admin), técnicos e todos os sócios veem o BM
const podeVerBm = requireRole('admin', 'tecnico', 'anestesita_socio')
// Ajustes manuais de pontos: só quem tem a flag admin (quem mais pode editar ainda vai ser definido)
const podeAjustarPontos = requireRole('admin')

router.get('/', podeVerBm, resumoMensal)
router.post('/ajustes', podeAjustarPontos, criar)
router.patch('/ajustes/:id', podeAjustarPontos, atualizar)
router.delete('/ajustes/:id', podeAjustarPontos, excluir)

module.exports = router
