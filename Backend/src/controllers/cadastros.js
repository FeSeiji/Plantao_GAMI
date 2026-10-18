const { createClient } = require('@supabase/supabase-js')

const { cnpjNormalizado } = require('../services/documentos')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Cadastros simples da gestão com nome, CNPJ e ativo: hospitais (casos fora e fichas) e convênios (fichas).
// Desativar esconde o item dos novos registros sem mexer nos antigos (por isso não há exclusão).
const MAX_NOME = 100
const CAMPOS = 'id, nome, cnpj, ativo'

// tabela: 'hospitais' | 'convenios'; nome: como o item aparece nas mensagens ("hospital", "convênio")
function criarCadastro({ tabela, nome }) {
  const Nome = nome[0].toUpperCase() + nome.slice(1)
  // 23505 = nome repetido (índice único sem diferenciar maiúsculas)
  const mensagemDeErro = error => (error.code === '23505' ? `Já existe um ${nome} com esse nome` : error.message)

  return {
    listar: async (req, res) => {
      const { data, error } = await supabase.from(tabela).select(CAMPOS).order('nome')
      if (error) return res.status(500).json({ error: error.message })
      return res.json(data)
    },

    // Corpo: nome e cnpj (opcional)
    criar: async (req, res) => {
      const nomeItem = String(req.body?.nome ?? '').trim().slice(0, MAX_NOME)
      if (!nomeItem) return res.status(400).json({ error: `Informe o nome do ${nome}` })

      let cnpj
      try {
        cnpj = cnpjNormalizado(req.body?.cnpj)
      } catch (err) {
        return res.status(400).json({ error: err.message })
      }

      const { data, error } = await supabase.from(tabela).insert({ nome: nomeItem, cnpj }).select(CAMPOS).single()
      if (error) return res.status(400).json({ error: mensagemDeErro(error) })
      return res.status(201).json(data)
    },

    // Corpo: nome, cnpj e/ou ativo
    atualizar: async (req, res) => {
      const alteracoes = {}

      if (req.body?.nome !== undefined) {
        const nomeItem = String(req.body.nome ?? '').trim().slice(0, MAX_NOME)
        if (!nomeItem) return res.status(400).json({ error: `Informe o nome do ${nome}` })
        alteracoes.nome = nomeItem
      }
      if (req.body?.cnpj !== undefined) {
        try {
          alteracoes.cnpj = cnpjNormalizado(req.body.cnpj)
        } catch (err) {
          return res.status(400).json({ error: err.message })
        }
      }
      if (req.body?.ativo !== undefined) {
        if (typeof req.body.ativo !== 'boolean') return res.status(400).json({ error: 'ativo deve ser true ou false' })
        alteracoes.ativo = req.body.ativo
      }
      if (Object.keys(alteracoes).length === 0) return res.status(400).json({ error: 'Nada para alterar' })

      const { data, error } = await supabase
        .from(tabela)
        .update(alteracoes)
        .eq('id', req.params.id)
        .select(CAMPOS)
        .maybeSingle()

      if (error) return res.status(400).json({ error: mensagemDeErro(error) })
      if (!data) return res.status(404).json({ error: `${Nome} não encontrado` })
      return res.json(data)
    },
  }
}

module.exports = { criarCadastro }
