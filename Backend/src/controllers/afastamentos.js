const { createClient } = require('@supabase/supabase-js')

const { ROLES_ANESTESISTA } = require('../services/usuarios')
const { TIPOS_AFASTAMENTO, hojeLocal } = require('../services/afastamentos')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const DATA_REGEX = /^\d{4}-\d{2}-\d{2}$/

function dataValida(data) {
  return DATA_REGEX.test(data ?? '') && !isNaN(new Date(`${data}T00:00:00Z`).getTime())
}

// Afastamentos atuais e futuros do próprio médico (os que já terminaram ficam de fora)
exports.listarMeus = async (req, res) => {
  const { data, error } = await supabase
    .from('afastamentos')
    .select('id, tipo, data_inicio, data_fim, observacao')
    .eq('usuario_id', req.user.id)
    .gte('data_fim', hojeLocal())
    .order('data_inicio', { ascending: true })

  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
}

// Gestão (admin/técnico) consulta os afastamentos atuais e futuros de um médico
exports.listarDoUsuario = async (req, res) => {
  const { data, error } = await supabase
    .from('afastamentos')
    .select('id, tipo, data_inicio, data_fim, observacao')
    .eq('usuario_id', req.params.usuarioId)
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
    .lte('data_inicio', data_fim)
    .gte('data_fim', data_inicio)
    .limit(1)

  if (sobreError) return res.status(500).json({ error: sobreError.message })
  if (sobrepostos.length > 0) {
    return res.status(409).json({ error: 'Já existe um afastamento seu que cobre parte desse período' })
  }

  const { data: criado, error } = await supabase
    .from('afastamentos')
    .insert({ usuario_id: req.user.id, tipo, data_inicio, data_fim, observacao: obs || null })
    .select('id, tipo, data_inicio, data_fim, observacao')
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

exports.remover = async (req, res) => {
  const { data, error } = await supabase
    .from('afastamentos')
    .delete()
    .eq('id', req.params.id)
    .eq('usuario_id', req.user.id)
    .select('id')

  if (error) return res.status(400).json({ error: error.message })
  if (!data || data.length === 0) return res.status(404).json({ error: 'Afastamento não encontrado' })

  return res.status(204).send()
}
