const express = require('express')
const router = express.Router()
const { requireRole } = require('../middleware/auth')
const { listar, criar, atualizar, remover } = require('../controllers/casosFora')

// Casos fora: todos os usuários logados veem; criam os anestesistas e a gestão.
// Editar e excluir (quem criou ou a gestão) é conferido no controller, caso a caso.
const podeCriar = requireRole('anestesita_socio', 'anestesita_socio_jr', 'anestesita_plantonista', 'escritorio', 'admin', 'tecnico')

router.get('/', listar)
router.post('/', podeCriar, criar)
router.patch('/:id', atualizar)
router.delete('/:id', remover)

module.exports = router
