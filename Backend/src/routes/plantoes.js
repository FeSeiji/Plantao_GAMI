const express = require('express')
const router = express.Router()
const { requireRole } = require('../middleware/auth')
const { createPlantao, listPlantoes, getPlantao, addUsuarios } = require('../controllers/plantoes')

router.get('/', listPlantoes)
router.get('/:id', getPlantao)
router.post('/', requireRole('coordenador', 'admin','tecnico'), createPlantao)
router.post('/:id/usuarios', requireRole('coordenador', 'admin'), addUsuarios)

module.exports = router
