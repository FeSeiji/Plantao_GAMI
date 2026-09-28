const express = require('express')
const router = express.Router()
const { requireRole } = require('../middleware/auth')
const { listarMeus, listarDoUsuario, criar, remover } = require('../controllers/afastamentos')

// Férias e congressos: cada médico gerencia os próprios; a gestão só consulta
router.get('/me', listarMeus)
router.get('/usuario/:usuarioId', requireRole('admin', 'tecnico'), listarDoUsuario)
router.post('/', criar)
router.delete('/:id', remover)

module.exports = router
