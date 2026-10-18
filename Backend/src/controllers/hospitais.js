const { criarCadastro } = require('./cadastros')

// Hospitais dos casos fora e das fichas anestésicas
module.exports = criarCadastro({ tabela: 'hospitais', nome: 'hospital' })
