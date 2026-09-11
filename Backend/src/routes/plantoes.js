const express = require('express')
const router = express.Router()
const { requireRole } = require('../middleware/auth')
const { createPlantao, listPlantoes, getPlantao, updatePlantao, addUsuarios, removeUsuario } = require('../controllers/plantoes')

router.get('/', listPlantoes)
router.get('/:id', getPlantao)
router.post('/', requireRole('coordenador', 'admin', 'tecnico'), createPlantao)
router.patch('/:id', requireRole('coordenador', 'admin', 'tecnico'), updatePlantao)
router.post('/:id/usuarios', requireRole('coordenador', 'admin', 'tecnico'), addUsuarios)
router.delete('/:id/usuarios/:usuarioId', requireRole('coordenador', 'admin', 'tecnico'), removeUsuario)

module.exports = router
