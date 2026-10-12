const express = require('express')
const router = express.Router()
const { requireRole } = require('../middleware/auth')
const { listar, obter, criar, atualizar, remover } = require('../controllers/fichas')

// Fichas anestésicas: todos os usuários logados veem; criam os anestesistas e a gestão.
// Editar e excluir (quem criou ou a gestão) é conferido no controller, ficha a ficha.
const podeCriar = requireRole('anestesita_socio', 'anestesita_plantonista', 'escritorio', 'admin', 'tecnico')

// Uma foto em base64 (já reduzida no celular). Só chega aqui quem passou pelo login
router.use(express.json({ limit: '5mb' }))

router.get('/', listar)
router.get('/:id', obter)
router.post('/', podeCriar, criar)
router.patch('/:id', atualizar)
router.delete('/:id', remover)

module.exports = router
