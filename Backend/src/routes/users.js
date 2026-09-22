const express = require('express')
const router = express.Router()
const { getUsers } = require('../controllers/useors')

router.get('/', getUsers)

module.exports = router
