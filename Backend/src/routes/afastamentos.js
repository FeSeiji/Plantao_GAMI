const express = require('express')
const router = express.Router()
const { listarMeus, criar, remover } = require('../controllers/afastamentos')

// Férias e congressos: cada médico só vê e gerencia os próprios
router.get('/me', listarMeus)
router.post('/', criar)
router.delete('/:id', remover)

module.exports = router
