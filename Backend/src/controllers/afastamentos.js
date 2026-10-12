const { createClient } = require('@supabase/supabase-js')

const { ROLES_ANESTESISTA } = require('../services/usuarios')
const { TIPOS_AFASTAMENTO, hojeLocal } = require('../services/afastamentos')
const { ehGestao } = require('../middleware/auth')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const DATA_REGEX = /^\d{4}-\d{2}-\d{2}$/

function dataValida(data) {
  return DATA_REGEX.test(data ?? '') && !isNaN(new Date(`${data}T00:00:00Z`).getTime())
}

const CAMPOS = 'id, tipo, data_inicio, data_fim, observacao, status'

// Afastamentos atuais e futuros do próprio médico (os que já terminaram ficam de fora).
// Inclui os recusados, para ele saber da resposta da gestão.
exports.listarMeus = async (req, res) => {
  const { data, error } = await supabase
    .from('afastamentos')
    .select(CAMPOS)
    .eq('usuario_id', req.user.id)
    .gte('data_fim', hojeLocal())
    .order('data_inicio', { ascending: true })

  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
}

// Gestão (escritório/admin/técnico) consulta os afastamentos atuais e futuros de um médico
exports.listarDoUsuario = async (req, res) => {
  const { data, error } = await supabase
    .from('afastamentos')
    .select(CAMPOS)
    .eq('usuario_id', req.params.usuarioId)
    .neq('status', 'recusado')
    .gte('data_fim', hojeLocal())
    .order('data_inicio', { ascending: true })

  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
}

exports.criar = async (req, res) => {
  const roles = req.user.app_metadata?.roles ?? []
  if (!roles.some(r => ROLES_ANESTESISTA.includes(r))) {
    return res.status(403).json({ error: 'Apenas anestesistas cadastram férias ou congressos' })
  }

  const { tipo, data_inicio, data_fim, observacao } = req.body

  if (!TIPOS_AFASTAMENTO.includes(tipo)) {
    return res.status(400).json({ error: "tipo deve ser 'ferias' ou 'congresso'" })
  }
  if (!dataValida(data_inicio) || !dataValida(data_fim)) {
    return res.status(400).json({ error: 'data_inicio e data_fim são obrigatórias (AAAA-MM-DD)' })
  }
  if (data_fim < data_inicio) {
    return res.status(400).json({ error: 'A data final não pode ser antes da inicial' })
  }
  if (data_fim < hojeLocal()) {
    return res.status(400).json({ error: 'O período já terminou' })
  }

  const obs = observacao ? String(observacao).trim().slice(0, 200) : null

  const { data: sobrepostos, error: sobreError } = await supabase
    .from('afastamentos')
    .select('id')
    .eq('usuario_id', req.user.id)
    .neq('status', 'recusado')
    .lte('data_inicio', data_fim)
    .gte('data_fim', data_inicio)
    .limit(1)

  if (sobreError) return res.status(500).json({ error: sobreError.message })
  if (sobrepostos.length > 0) {
    return res.status(409).json({ error: 'Já existe um afastamento seu que cobre parte desse período' })
  }

  const { data: criado, error } = await supabase
    .from('afastamentos')
    // Nasce pendente: só bloqueia a escala depois que a gestão aprovar
    .insert({ usuario_id: req.user.id, tipo, data_inicio, data_fim, observacao: obs || null, status: 'pendente' })
    .select(CAMPOS)
    .single()

  if (error) return res.status(400).json({ error: error.message })

  // Plantões em que ele já está escalado nesse período: continuam como estão, só ganham o indicador
  const { data: escalas, error: escalasError } = await supabase
    .from('plantao_usuarios')
    .select('plantoes!inner(id, titulo, data, hora_inicio)')
    .eq('usuario_id', req.user.id)
    .gte('plantoes.data', data_inicio)
    .lte('plantoes.data', data_fim)

  if (escalasError) console.error(escalasError)

  const plantoesAfetados = (escalas ?? [])
    .map(e => e.plantoes)
    .sort((a, b) => (a.data + a.hora_inicio).localeCompare(b.data + b.hora_inicio))

  return res.status(201).json({ ...criado, plantoesAfetados })
}

// O médico apaga o próprio pedido pendente ou recusado; um aprovado só a gestão remove
exports.remover = async (req, res) => {
  const { data: afastamento, error: buscaError } = await supabase
    .from('afastamentos')
    .select('id, usuario_id, status')
    .eq('id', req.params.id)
    .maybeSingle()

  if (buscaError) return res.status(500).json({ error: buscaError.message })

  const gestao = ehGestao(req.user)
  if (!afastamento || (!gestao && afastamento.usuario_id !== req.user.id)) {
    return res.status(404).json({ error: 'Afastamento não encontrado' })
  }
  if (!gestao && afastamento.status === 'aprovado') {
    return res.status(403).json({ error: 'Período já aprovado: peça à gestão para remover' })
  }

  const { error } = await supabase.from('afastamentos').delete().eq('id', afastamento.id)
  if (error) return res.status(400).json({ error: error.message })

  return res.status(204).send()
}

// Pedidos aguardando a gestão (os que já terminaram ficam de fora), com o nome do médico
exports.listarPendentes = async (req, res) => {
  const { data, error } = await supabase
    .from('afastamentos')
    .select('id, usuario_id, tipo, data_inicio, data_fim, observacao')
    .eq('status', 'pendente')
    .gte('data_fim', hojeLocal())
    .order('data_inicio', { ascending: true })

  if (error) return res.status(500).json({ error: error.message })

  const ids = [...new Set(data.map(a => a.usuario_id))]
  const { data: perfis, error: perfisError } = ids.length
    ? await supabase.from('profiles').select('id, nome, email, sigla').in('id', ids)
    : { data: [], error: null }

  if (perfisError) return res.status(500).json({ error: perfisError.message })

  const porId = new Map(perfis.map(p => [p.id, p]))
  return res.json(data.map(({ usuario_id, ...a }) => ({ ...a, usuario: porId.get(usuario_id) ?? { id: usuario_id } })))
}

// Aprovar ou recusar: só passa se ainda estiver pendente, mesmo com duas pessoas respondendo juntas
exports.responder = (aprovar) => async (req, res) => {
  const { data, error } = await supabase
    .from('afastamentos')
    .update({
      status: aprovar ? 'aprovado' : 'recusado',
      respondido_por: req.user.id,
      respondido_em: new Date().toISOString(),
    })
    .eq('id', req.params.id)
    .eq('status', 'pendente')
    .select(CAMPOS)
    .maybeSingle()

  if (error) return res.status(400).json({ error: error.message })
  if (!data) return res.status(409).json({ error: 'Esse pedido já foi respondido ou não existe mais' })

  return res.json(data)
}
