const express = require('express')
const router = express.Router()
const { requireRole } = require('../middleware/auth')
const { createPlantao, listPlantoes, getPlantao, updatePlantao, addUsuarios, removeUsuario, definirCoordenador } = require('../controllers/plantoes')

router.get('/', listPlantoes)
router.get('/:id', getPlantao)
router.post('/', requireRole('coordenador', 'admin', 'tecnico'), createPlantao)
router.patch('/:id', requireRole('coordenador', 'admin', 'tecnico'), updatePlantao)
router.post('/:id/usuarios', requireRole('coordenador', 'admin', 'tecnico'), addUsuarios)
router.patch('/:id/coordenador', requireRole('coordenador', 'admin', 'tecnico'), definirCoordenador)
router.delete('/:id/usuarios/:usuarioId', requireRole('coordenador', 'admin', 'tecnico'), removeUsuario)

module.exports = router
