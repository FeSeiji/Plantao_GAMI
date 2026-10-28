const { createClient } = require('@supabase/supabase-js')

const { ROLES_ANESTESISTA } = require('../services/usuarios')
const { TIPOS_AFASTAMENTO, TIPOS_CONGRESSO, hojeLocal } = require('../services/afastamentos')
const { horarioDaVaga } = require('../services/posicoes')
const { ehGestao } = require('../middleware/auth')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const DATA_REGEX = /^\d{4}-\d{2}-\d{2}$/
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function dataValida(data) {
  return DATA_REGEX.test(data ?? '') && !isNaN(new Date(`${data}T00:00:00Z`).getTime())
}

const CAMPOS = 'id, tipo, congresso_tipo, data_inicio, data_fim, observacao, status'

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

const STATUS_AFASTAMENTO = ['pendente', 'aprovado', 'recusado']

// Tela "Férias e congressos" da gestão: todos os médicos, com o nome de cada um.
// Sem período, vêm os atuais e futuros; com inicio/fim, os que tocam esse intervalo.
// Sem status, vêm os aprovados e os pendentes (os recusados só quando pedidos)
exports.listarTodos = async (req, res) => {
  const { inicio, fim, tipo, status } = req.query

  if ((inicio && !dataValida(inicio)) || (fim && !dataValida(fim))) {
    return res.status(400).json({ error: 'inicio e fim devem estar no formato AAAA-MM-DD' })
  }
  if (tipo && !TIPOS_AFASTAMENTO.includes(tipo)) {
    return res.status(400).json({ error: "tipo deve ser 'ferias' ou 'congresso'" })
  }
  if (status && !STATUS_AFASTAMENTO.includes(status)) {
    return res.status(400).json({ error: "status deve ser 'pendente', 'aprovado' ou 'recusado'" })
  }

  let query = supabase
    .from('afastamentos')
    .select(`usuario_id, ${CAMPOS}`)
    .in('status', status ? [status] : ['aprovado', 'pendente'])
    .gte('data_fim', inicio || hojeLocal())
    .order('data_inicio', { ascending: true })
    .limit(1000)

  if (fim) query = query.lte('data_inicio', fim)
  if (tipo) query = query.eq('tipo', tipo)

  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })

  const ids = [...new Set(data.map(a => a.usuario_id))]
  const { data: perfis, error: perfisError } = ids.length
    ? await supabase.from('profiles').select('id, nome, email, sigla').in('id', ids)
    : { data: [], error: null }

  if (perfisError) return res.status(500).json({ error: perfisError.message })

  const porId = new Map(perfis.map(p => [p.id, p]))
  return res.json(data.map(({ usuario_id, ...a }) => ({ ...a, usuario: porId.get(usuario_id) ?? { id: usuario_id } })))
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

// O médico pede o próprio período: nasce pendente (a gestão aprova) e só de hoje em diante
exports.criar = async (req, res) => {
  const roles = req.user.app_metadata?.roles ?? []
  if (!roles.some(r => ROLES_ANESTESISTA.includes(r))) {
    return res.status(403).json({ error: 'Apenas anestesistas cadastram férias ou congressos' })
  }
  return cadastrar(req, res, req.user.id, { pelaGestao: false })
}

// A gestão cadastra o período de qualquer médico: já nasce aprovado e pode ser no passado
// (para lançar umas férias esquecidas e o BM daquele mês sair certo)
exports.criarParaMedico = async (req, res) => {
  // Id fora do formato faz o Supabase lançar erro em vez de devolver "não encontrado"
  if (!UUID_REGEX.test(req.params.usuarioId)) return res.status(404).json({ error: 'Médico não encontrado' })
  const { data: auth, error } = await supabase.auth.admin.getUserById(req.params.usuarioId)
  if (error || !auth?.user) return res.status(404).json({ error: 'Médico não encontrado' })
  if (!(auth.user.app_metadata?.roles ?? []).some(r => ROLES_ANESTESISTA.includes(r))) {
    return res.status(400).json({ error: 'Férias e congressos são só para médicos (sócios e plantonistas)' })
  }
  return cadastrar(req, res, auth.user.id, { pelaGestao: true })
}

async function cadastrar(req, res, usuarioId, { pelaGestao }) {
  const { tipo, congresso_tipo, data_inicio, data_fim, observacao } = req.body ?? {}

  if (!TIPOS_AFASTAMENTO.includes(tipo)) {
    return res.status(400).json({ error: "tipo deve ser 'ferias' ou 'congresso'" })
  }
  // Congresso precisa do tipo, que define quanto da vaga o médico recebe (palestrante 80%, congressista 60%)
  if (tipo === 'congresso' && !TIPOS_CONGRESSO.includes(congresso_tipo)) {
    const quem = pelaGestao ? 'o médico vai' : 'você vai'
    return res.status(400).json({ error: `Informe se ${quem} ao congresso como palestrante ou congressista` })
  }
  if (!dataValida(data_inicio) || !dataValida(data_fim)) {
    return res.status(400).json({ error: 'data_inicio e data_fim são obrigatórias (AAAA-MM-DD)' })
  }
  if (data_fim < data_inicio) {
    return res.status(400).json({ error: 'A data final não pode ser antes da inicial' })
  }
  if (!pelaGestao && data_fim < hojeLocal()) {
    return res.status(400).json({ error: 'O período já terminou' })
  }

  const obs = observacao ? String(observacao).trim().slice(0, 200) : null

  const { data: sobrepostos, error: sobreError } = await supabase
    .from('afastamentos')
    .select('id')
    .eq('usuario_id', usuarioId)
    .neq('status', 'recusado')
    .lte('data_inicio', data_fim)
    .gte('data_fim', data_inicio)
    .limit(1)

  if (sobreError) return res.status(500).json({ error: sobreError.message })
  if (sobrepostos.length > 0) {
    const erro = pelaGestao
      ? 'Esse médico já tem férias ou congresso em parte desse período'
      : 'Já existe um afastamento seu que cobre parte desse período'
    return res.status(409).json({ error: erro })
  }

  const { data: criado, error } = await supabase
    .from('afastamentos')
    // Pedido do médico nasce pendente: só bloqueia a escala depois que a gestão aprovar
    .insert({
      usuario_id: usuarioId,
      tipo,
      congresso_tipo: tipo === 'congresso' ? congresso_tipo : null,
      data_inicio,
      data_fim,
      observacao: obs || null,
      status: pelaGestao ? 'aprovado' : 'pendente',
      ...(pelaGestao ? { respondido_por: req.user.id, respondido_em: new Date().toISOString() } : {}),
    })
    .select(CAMPOS)
    .single()

  if (error) return res.status(400).json({ error: error.message })

  // Vagas em que ele já está escalado nesse período: continuam como estão, só ganham o indicador.
  // O horário de cada uma é o do turno da vaga
  const { data: escalas, error: escalasError } = await supabase
    .from('plantao_usuarios')
    .select('posicao, plantoes!inner(id, titulo, data)')
    .eq('usuario_id', usuarioId)
    .gte('plantoes.data', data_inicio)
    .lte('plantoes.data', data_fim)

  if (escalasError) console.error(escalasError)

  const plantoesAfetados = (escalas ?? [])
    .map(e => ({ ...e.plantoes, ...horarioDaVaga(e.plantoes, e.posicao) }))
    .sort((a, b) => (a.data + a.hora_inicio).localeCompare(b.data + b.hora_inicio))

  return res.status(201).json({ ...criado, plantoesAfetados })
}

// Tipo do congresso (palestrante ou congressista). Os congressos cadastrados antes dos tipos ficaram sem:
// o próprio médico define enquanto estiver sem tipo ou pendente; a gestão define ou muda a qualquer momento
exports.definirTipoCongresso = async (req, res) => {
  const { congresso_tipo } = req.body ?? {}
  if (!TIPOS_CONGRESSO.includes(congresso_tipo)) {
    return res.status(400).json({ error: "congresso_tipo deve ser 'palestrante' ou 'congressista'" })
  }

  const { data: afastamento, error: buscaError } = await supabase
    .from('afastamentos')
    .select('id, usuario_id, tipo, congresso_tipo, status')
    .eq('id', req.params.id)
    .maybeSingle()

  if (buscaError) return res.status(500).json({ error: buscaError.message })

  const gestao = ehGestao(req.user)
  if (!afastamento || (!gestao && afastamento.usuario_id !== req.user.id)) {
    return res.status(404).json({ error: 'Afastamento não encontrado' })
  }
  if (afastamento.tipo !== 'congresso') return res.status(400).json({ error: 'Só congresso tem tipo' })
  if (!gestao && afastamento.congresso_tipo && afastamento.status !== 'pendente') {
    return res.status(403).json({ error: 'Congresso já aprovado: peça à gestão para mudar o tipo' })
  }

  const { data, error } = await supabase
    .from('afastamentos')
    .update({ congresso_tipo })
    .eq('id', afastamento.id)
    .select(CAMPOS)
    .single()

  if (error) return res.status(400).json({ error: error.message })
  return res.json(data)
}

// O médico apaga o próprio pedido pendente ou recusado; um aprovado só a gestão remove. Férias aprovadas
// removidas levam junto as coberturas de férias do período (aceitas ou pedidas): sem as férias, quem cobria
// continuaria ganhando a vaga inteira junto com o titular
exports.remover = async (req, res) => {
  const { data: afastamento, error: buscaError } = await supabase
    .from('afastamentos')
    .select('id, usuario_id, tipo, status, data_inicio, data_fim')
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

  if (afastamento.tipo === 'ferias' && afastamento.status === 'aprovado') {
    try {
      await cancelarCoberturasDasFerias(afastamento)
    } catch (err) {
      console.error(err)
      return res.status(500).json({
        error: `Férias removidas, mas as coberturas de férias do período não foram canceladas (${err.message}). Desfaça-as no plantão.`
      })
    }
  }

  return res.status(204).send()
}

async function cancelarCoberturasDasFerias({ usuario_id, data_inicio, data_fim }) {
  const { data: coberturas, error } = await supabase
    .from('plantao_trocas')
    .select('id, plantoes!inner(data)')
    .eq('usuario_saida', usuario_id)
    .eq('cobertura_ferias', true)
    .in('status', ['pendente', 'aceita'])
    .gte('plantoes.data', data_inicio)
    .lte('plantoes.data', data_fim)
  if (error) throw error
  if (coberturas.length === 0) return

  const { error: cancelarError } = await supabase
    .from('plantao_trocas')
    .update({ status: 'cancelada', respondido_em: new Date().toISOString() })
    .in('id', coberturas.map(c => c.id))
  if (cancelarError) throw cancelarError
}

// Pedidos aguardando a gestão (os que já terminaram ficam de fora), com o nome do médico
exports.listarPendentes = async (req, res) => {
  const { data, error } = await supabase
    .from('afastamentos')
    .select('id, usuario_id, tipo, congresso_tipo, data_inicio, data_fim, observacao')
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
