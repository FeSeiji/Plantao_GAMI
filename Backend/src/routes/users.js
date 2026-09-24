const express = require('express')
const router = express.Router()
const { requireRole } = require('../middleware/auth')
const {
  getUsers, listarGestao, criarUsuarioGestao, atualizarUsuario, alterarAtivo, enviarResetSenha,
} = require('../controllers/users')

const podeVerGestao = requireRole('admin', 'anestesita_socio', 'tecnico')
// Técnico também edita, mas o controller o impede de mexer em admins
const podeEditarGestao = requireRole('admin', 'tecnico')

router.get('/', getUsers)
router.get('/gestao', podeVerGestao, listarGestao)
router.post('/', podeEditarGestao, criarUsuarioGestao)
router.patch('/:id', podeEditarGestao, atualizarUsuario)
router.patch('/:id/ativo', podeEditarGestao, alterarAtivo)
router.post('/:id/reset-senha', podeEditarGestao, enviarResetSenha)

module.exports = router
