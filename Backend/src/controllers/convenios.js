const { criarCadastro } = require('./cadastros')

// Convênios das fichas anestésicas
module.exports = criarCadastro({ tabela: 'convenios', nome: 'convênio' })
