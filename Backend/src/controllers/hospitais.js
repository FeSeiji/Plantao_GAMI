const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Hospitais dos casos fora. Desativar esconde o hospital dos novos casos sem mexer nos antigos
// (por isso não há exclusão).
const MAX_NOME = 100

exports.listar = async (req, res) => {
  const { data, error } = await supabase.from('hospitais').select('id, nome, ativo').order('nome')
  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
}

exports.criar = async (req, res) => {
  const nome = String(req.body?.nome ?? '').trim().slice(0, MAX_NOME)
  if (!nome) return res.status(400).json({ error: 'Informe o nome do hospital' })

  const { data, error } = await supabase.from('hospitais').insert({ nome }).select('id, nome, ativo').single()
  if (error) return res.status(400).json({ error: mensagemDeErro(error) })
  return res.status(201).json(data)
}

// Corpo: nome e/ou ativo
exports.atualizar = async (req, res) => {
  const alteracoes = {}

  if (req.body?.nome !== undefined) {
    const nome = String(req.body.nome ?? '').trim().slice(0, MAX_NOME)
    if (!nome) return res.status(400).json({ error: 'Informe o nome do hospital' })
    alteracoes.nome = nome
  }
  if (req.body?.ativo !== undefined) {
    if (typeof req.body.ativo !== 'boolean') return res.status(400).json({ error: 'ativo deve ser true ou false' })
    alteracoes.ativo = req.body.ativo
  }
  if (Object.keys(alteracoes).length === 0) return res.status(400).json({ error: 'Nada para alterar' })

  const { data, error } = await supabase
    .from('hospitais')
    .update(alteracoes)
    .eq('id', req.params.id)
    .select('id, nome, ativo')
    .maybeSingle()

  if (error) return res.status(400).json({ error: mensagemDeErro(error) })
  if (!data) return res.status(404).json({ error: 'Hospital não encontrado' })
  return res.json(data)
}

// 23505 = nome repetido (índice único sem diferenciar maiúsculas)
const mensagemDeErro = error => (error.code === '23505' ? 'Já existe um hospital com esse nome' : error.message)
