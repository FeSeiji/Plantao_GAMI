const express = require('express')
const router = express.Router()
const { requireRole } = require('../middleware/auth')
const { listar, obter, criar, atualizar, remover, exportar } = require('../controllers/fichas')

// Fichas anestésicas: a gestão vê todas e o médico, as dele (conferido no controller); criam os anestesistas
// e a gestão. Editar e excluir (quem criou ou a gestão) também é conferido no controller, ficha a ficha.
const podeCriar = requireRole('anestesita_socio', 'anestesita_socio_jr', 'anestesita_plantonista', 'escritorio', 'admin', 'tecnico')

// Uma foto em base64 (já reduzida no celular). Só chega aqui quem passou pelo login
router.use(express.json({ limit: '5mb' }))

router.get('/', listar)
// Antes de '/:id', senão "exportar" seria lido como o id de uma ficha. Cada um exporta o que pode ver
router.get('/exportar', exportar)
router.get('/:id', obter)
router.post('/', podeCriar, criar)
router.patch('/:id', atualizar)
router.delete('/:id', remover)

module.exports = router
