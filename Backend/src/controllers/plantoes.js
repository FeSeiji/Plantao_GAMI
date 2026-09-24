const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const TIPOS_VALIDOS = ['plantonista', 'socio']
const ROLES_MEDICO = ['anestesita_plantonista', 'anestesita_socio']

exports.createPlantao = async (req, res) => {
  const { titulo, descricao, data, hora_inicio, hora_fim, tipo, usuarios, coordenador_id, fila } = req.body

  if (!titulo || !data || !hora_inicio || !hora_fim) {
    return res.status(400).json({ error: 'titulo, data, hora_inicio e hora_fim são obrigatórios' })
  }

  if (!TIPOS_VALIDOS.includes(tipo)) {
    return res.status(400).json({ error: "tipo é obrigatório e deve ser 'plantonista' ou 'socio'" })
  }

  const janela = { data, horaInicio: hora_inicio, horaFim: hora_fim }

  let membros
  try {
    membros = tipo === 'plantonista'
      ? await validarEquipePlantonista(usuarios, coordenador_id, { janela })
      : await validarFilaSocio(fila, { janela })
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }

  const { data: plantao, error } = await supabase
    .from('plantoes')
    .insert({
      titulo,
      descricao: descricao ?? null,
      data,
      hora_inicio,
      hora_fim,
      tipo,
      criado_por: req.user.id,
    })
    .select()
    .single()

  if (error) return res.status(400).json({ error: error.message })

  if (membros.length > 0) {
    const { error: membrosError } = await supabase
      .from('plantao_usuarios')
      .insert(membros.map(m => ({ plantao_id: plantao.id, ...m })))

    if (membrosError) return res.status(400).json({ error: membrosError.message })
  }

  try {
    const perfis = await buscarPerfis(membros.map(m => m.usuario_id))
    return res.status(201).json(formatPlantao({ ...plantao, plantao_usuarios: membros }, perfis))
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

exports.listPlantoes = async (req, res) => {
  const { inicio, fim, tipo } = req.query

  if (tipo !== undefined && !TIPOS_VALIDOS.includes(tipo)) {
    return res.status(400).json({ error: "tipo deve ser 'plantonista' ou 'socio'" })
  }

  let query = supabase
    .from('plantoes')
    .select('*, plantao_usuarios(usuario_id, is_coordenador, posicao)')
    .order('data', { ascending: true })
    .order('hora_inicio', { ascending: true })

  if (inicio) query = query.gte('data', inicio)
  if (fim) query = query.lte('data', fim)
  if (tipo) query = query.eq('tipo', tipo)

  const { data, error } = await query

  if (error) return res.status(500).json({ error: error.message })

  try {
    const perfis = await buscarPerfis(data.flatMap(row => row.plantao_usuarios.map(u => u.usuario_id)))
    const trocasPendentes = await buscarTrocasPendentesPorSlot(data.map(row => row.id))
    return res.json(data.map(row => formatPlantao(row, perfis, trocasPendentes)))
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

exports.getPlantao = async (req, res) => {
  const { data, error } = await supabase
    .from('plantoes')
    .select('*, plantao_usuarios(usuario_id, is_coordenador, posicao)')
    .eq('id', req.params.id)
    .maybeSingle()

  if (error) return res.status(500).json({ error: error.message })
  if (!data) return res.status(404).json({ error: 'Plantão não encontrado' })

  try {
    const perfis = await buscarPerfis(data.plantao_usuarios.map(u => u.usuario_id))
    const trocasPendentes = await buscarTrocasPendentesPorSlot([data.id])
    return res.json(formatPlantao(data, perfis, trocasPendentes))
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

exports.updatePlantao = async (req, res) => {
  const { titulo, descricao, data, hora_inicio, hora_fim } = req.body

  const updates = {}
  if (titulo !== undefined) updates.titulo = titulo
  if (descricao !== undefined) updates.descricao = descricao || null
  if (data !== undefined) updates.data = data
  if (hora_inicio !== undefined) updates.hora_inicio = hora_inicio
  if (hora_fim !== undefined) updates.hora_fim = hora_fim

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Nenhum campo para atualizar' })
  }

  const { data: plantao, error } = await supabase
    .from('plantoes')
    .update(updates)
    .eq('id', req.params.id)
    .select('*, plantao_usuarios(usuario_id, is_coordenador, posicao)')
    .maybeSingle()

  if (error) return res.status(400).json({ error: error.message })
  if (!plantao) return res.status(404).json({ error: 'Plantão não encontrado' })

  try {
    const perfis = await buscarPerfis(plantao.plantao_usuarios.map(u => u.usuario_id))
    const trocasPendentes = await buscarTrocasPendentesPorSlot([plantao.id])
    return res.json(formatPlantao(plantao, perfis, trocasPendentes))
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

exports.removeUsuario = async (req, res) => {
  const { data: membro, error: membroError } = await supabase
    .from('plantao_usuarios')
    .select('is_coordenador, posicao')
    .eq('plantao_id', req.params.id)
    .eq('usuario_id', req.params.usuarioId)
    .maybeSingle()

  if (membroError) return res.status(500).json({ error: membroError.message })
  if (!membro) return res.status(404).json({ error: 'Médico não está neste plantão' })

  if (membro.is_coordenador) {
    return res.status(400).json({ error: 'Defina outro coordenador antes de remover o atual' })
  }

  const { error } = await supabase
    .from('plantao_usuarios')
    .delete()
    .eq('plantao_id', req.params.id)
    .eq('usuario_id', req.params.usuarioId)

  if (error) return res.status(400).json({ error: error.message })

  // A troca pendente do slot perde o sentido, mas continua no histórico como cancelada
  const { error: trocaError } = await supabase
    .from('plantao_trocas')
    .update({ status: 'cancelada', respondido_em: new Date().toISOString() })
    .eq('plantao_id', req.params.id)
    .eq('usuario_saida', req.params.usuarioId)
    .eq('status', 'pendente')

  if (trocaError) return res.status(500).json({ error: trocaError.message })

  // Registro no histórico do plantão, como acontece com as trocas
  const { error: logError } = await supabase
    .from('plantao_remocoes')
    .insert({
      plantao_id: req.params.id,
      usuario_id: req.params.usuarioId,
      removido_por: req.user.id,
      era_coordenador: membro.is_coordenador ?? false,
      posicao: membro.posicao ?? null,
    })

  if (logError) return res.status(500).json({ error: `Médico removido, mas o histórico não foi gravado: ${logError.message}` })

  return res.status(204).send()
}

exports.listarRemocoesDoPlantao = async (req, res) => {
  const { data, error } = await supabase
    .from('plantao_remocoes')
    .select('*')
    .eq('plantao_id', req.params.id)
    .order('removido_em', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })

  try {
    const perfis = await buscarPerfis(data.flatMap(r => [r.usuario_id, r.removido_por]))
    return res.json(data.map(r => ({
      id: r.id,
      removidoEm: r.removido_em,
      eraCoordenador: r.era_coordenador,
      posicao: r.posicao,
      usuario: perfis.get(r.usuario_id) ?? { id: r.usuario_id },
      removidoPor: perfis.get(r.removido_por) ?? { id: r.removido_por },
    })))
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

exports.addUsuarios = async (req, res) => {
  const { data: plantao, error: plantaoError } = await supabase
    .from('plantoes')
    .select('id, tipo, data, hora_inicio, hora_fim')
    .eq('id', req.params.id)
    .maybeSingle()

  if (plantaoError) return res.status(500).json({ error: plantaoError.message })
  if (!plantao) return res.status(404).json({ error: 'Plantão não encontrado' })

  const janela = { data: plantao.data, horaInicio: plantao.hora_inicio, horaFim: plantao.hora_fim, excluirPlantaoId: plantao.id }

  let membros
  try {
    membros = plantao.tipo === 'plantonista'
      ? (await validarEquipePlantonista(req.body.usuarios, null, { exigirCoordenador: false, janela }))
      : await validarFilaSocio(req.body.fila, { janela })
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }

  const { error } = await supabase
    .from('plantao_usuarios')
    .upsert(
      membros.map(m => ({ plantao_id: req.params.id, ...m })),
      { onConflict: 'plantao_id,usuario_id', ignoreDuplicates: plantao.tipo === 'plantonista' }
    )

  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Posição já ocupada nesse plantão' })
    return res.status(400).json({ error: error.message })
  }

  return res.status(201).json({ message: 'Médicos adicionados ao plantão' })
}

exports.definirCoordenador = async (req, res) => {
  const { usuario_id } = req.body
  if (!usuario_id) return res.status(400).json({ error: 'usuario_id é obrigatório' })

  const { data: plantao, error: plantaoError } = await supabase
    .from('plantoes')
    .select('id, tipo')
    .eq('id', req.params.id)
    .maybeSingle()

  if (plantaoError) return res.status(500).json({ error: plantaoError.message })
  if (!plantao) return res.status(404).json({ error: 'Plantão não encontrado' })
  if (plantao.tipo !== 'plantonista') {
    return res.status(400).json({ error: 'Somente plantões de plantonista têm coordenador' })
  }

  const { data: membro, error: membroError } = await supabase
    .from('plantao_usuarios')
    .select('usuario_id')
    .eq('plantao_id', req.params.id)
    .eq('usuario_id', usuario_id)
    .maybeSingle()

  if (membroError) return res.status(500).json({ error: membroError.message })
  if (!membro) return res.status(400).json({ error: 'O médico precisa estar na equipe do plantão para ser coordenador' })

  const { error: limparError } = await supabase
    .from('plantao_usuarios')
    .update({ is_coordenador: false })
    .eq('plantao_id', req.params.id)

  if (limparError) return res.status(400).json({ error: limparError.message })

  const { error: definirError } = await supabase
    .from('plantao_usuarios')
    .update({ is_coordenador: true })
    .eq('plantao_id', req.params.id)
    .eq('usuario_id', usuario_id)

  if (definirError) return res.status(400).json({ error: definirError.message })

  return res.json({ message: 'Coordenador definido' })
}

exports.criarTroca = async (req, res) => {
  const { usuario_saida, usuario_entrada } = req.body

  if (!usuario_saida || !usuario_entrada) {
    return res.status(400).json({ error: 'usuario_saida e usuario_entrada são obrigatórios' })
  }
  if (usuario_saida === usuario_entrada) {
    return res.status(400).json({ error: 'usuario_saida e usuario_entrada devem ser diferentes' })
  }

  const { data: plantao, error: plantaoError } = await supabase
    .from('plantoes')
    .select('id, tipo, data, hora_inicio, hora_fim')
    .eq('id', req.params.id)
    .maybeSingle()

  if (plantaoError) return res.status(500).json({ error: plantaoError.message })
  if (!plantao) return res.status(404).json({ error: 'Plantão não encontrado' })

  const { data: slotSaida, error: slotError } = await supabase
    .from('plantao_usuarios')
    .select('usuario_id')
    .eq('plantao_id', req.params.id)
    .eq('usuario_id', usuario_saida)
    .maybeSingle()

  if (slotError) return res.status(500).json({ error: slotError.message })
  if (!slotSaida) return res.status(400).json({ error: 'usuario_saida não está nesse plantão' })

  const { data: slotEntrada, error: slotEntradaError } = await supabase
    .from('plantao_usuarios')
    .select('usuario_id')
    .eq('plantao_id', req.params.id)
    .eq('usuario_id', usuario_entrada)
    .maybeSingle()

  if (slotEntradaError) return res.status(500).json({ error: slotEntradaError.message })
  if (slotEntrada) return res.status(400).json({ error: 'usuario_entrada já está nesse plantão' })

  const invalidos = await usuariosSemRoleMedico([usuario_entrada])
  if (invalidos.length > 0) {
    return res.status(400).json({ error: 'usuario_entrada precisa ser um médico (anestesita_socio ou anestesita_plantonista)' })
  }

  const ocupados = await usuariosComConflito([usuario_entrada], plantao.data, plantao.hora_inicio, plantao.hora_fim, plantao.id)
  if (ocupados.size > 0) {
    return res.status(400).json({ error: 'usuario_entrada já está escalado em outro plantão nesse horário' })
  }

  const { data: troca, error } = await supabase
    .from('plantao_trocas')
    .insert({
      plantao_id: req.params.id,
      usuario_saida,
      usuario_entrada,
      solicitado_por: req.user.id,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Já existe uma troca pendente para esse médico' })
    return res.status(400).json({ error: error.message })
  }

  try {
    const perfis = await buscarPerfis([usuario_saida, usuario_entrada, req.user.id])
    return res.status(201).json(formatTroca(troca, perfis))
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

exports.listarTrocasDoPlantao = async (req, res) => {
  const { data, error } = await supabase
    .from('plantao_trocas')
    .select('*')
    .eq('plantao_id', req.params.id)
    .order('solicitado_em', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })

  try {
    const ids = data.flatMap(t => [t.usuario_saida, t.usuario_entrada, t.solicitado_por])
    const perfis = await buscarPerfis(ids)
    return res.json(data.map(t => formatTroca(t, perfis)))
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

exports.listarTrocasPendentes = async (req, res) => {
  const { data, error } = await supabase
    .from('plantao_trocas')
    .select('*, plantoes(id, titulo, data, hora_inicio, hora_fim)')
    .eq('usuario_entrada', req.user.id)
    .eq('status', 'pendente')
    .order('solicitado_em', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })

  try {
    const ids = data.flatMap(t => [t.usuario_saida, t.solicitado_por])
    const perfis = await buscarPerfis(ids)
    return res.json(data.map(({ plantoes: plantao, ...t }) => ({ ...formatTroca(t, perfis), plantao })))
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

exports.responderTroca = (aceitar) => async (req, res) => {
  const { data: troca, error: trocaError } = await supabase
    .from('plantao_trocas')
    .select('*')
    .eq('id', req.params.trocaId)
    .maybeSingle()

  if (trocaError) return res.status(500).json({ error: trocaError.message })
  if (!troca) return res.status(404).json({ error: 'Solicitação não encontrada' })
  if (troca.usuario_entrada !== req.user.id) {
    return res.status(403).json({ error: 'Só o médico convidado pode responder essa solicitação' })
  }
  if (troca.status !== 'pendente') {
    return res.status(400).json({ error: 'Essa solicitação já foi respondida' })
  }

  if (aceitar) {
    const { data: linhasAtualizadas, error: swapError } = await supabase
      .from('plantao_usuarios')
      .update({ usuario_id: troca.usuario_entrada })
      .eq('plantao_id', troca.plantao_id)
      .eq('usuario_id', troca.usuario_saida)
      .select()

    if (swapError) return res.status(400).json({ error: swapError.message })
    if (!linhasAtualizadas || linhasAtualizadas.length === 0) {
      return res.status(409).json({ error: 'O médico que está saindo não está mais nesse plantão' })
    }
  }

  const { data: atualizada, error } = await supabase
    .from('plantao_trocas')
    .update({ status: aceitar ? 'aceita' : 'recusada', respondido_em: new Date().toISOString() })
    .eq('id', req.params.trocaId)
    .select()
    .single()

  if (error) return res.status(400).json({ error: error.message })

  try {
    const perfis = await buscarPerfis([atualizada.usuario_saida, atualizada.usuario_entrada, atualizada.solicitado_por])
    return res.json(formatTroca(atualizada, perfis))
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

async function validarEquipePlantonista(usuarios, coordenadorId, { exigirCoordenador = true, janela } = {}) {
  if (!Array.isArray(usuarios) || usuarios.length === 0) {
    throw new Error('usuarios deve ser um array não vazio de ids')
  }

  if (exigirCoordenador && (!coordenadorId || !usuarios.includes(coordenadorId))) {
    throw new Error('coordenador_id é obrigatório e deve estar entre os usuarios')
  }

  const invalidos = await usuariosSemRoleMedico(usuarios)
  if (invalidos.length > 0) {
    throw new Error(`Usuários que não são médicos (anestesita_socio ou anestesita_plantonista): ${invalidos.join(', ')}`)
  }

  if (janela) {
    const ocupados = await usuariosComConflito(usuarios, janela.data, janela.horaInicio, janela.horaFim, janela.excluirPlantaoId)
    if (ocupados.size > 0) {
      throw new Error(`Médico(s) já escalado(s) em outro plantão nesse horário: ${[...ocupados].join(', ')}`)
    }
  }

  return usuarios.map(usuario_id => ({
    usuario_id,
    is_coordenador: usuario_id === coordenadorId,
    posicao: null,
  }))
}

async function validarFilaSocio(fila, { janela } = {}) {
  if (!Array.isArray(fila) || fila.length === 0) {
    throw new Error('fila deve ser um array não vazio de { usuario_id, posicao }')
  }

  const posicaoInvalida = fila.some(
    f => !f?.usuario_id || !Number.isInteger(f.posicao) || f.posicao < 1 || f.posicao > 7
  )
  if (posicaoInvalida) {
    throw new Error('cada item da fila precisa de usuario_id e posicao (número inteiro entre 1 e 7)')
  }

  const posicoes = fila.map(f => f.posicao)
  if (new Set(posicoes).size !== posicoes.length) {
    throw new Error('posições da fila não podem se repetir')
  }

  const usuarioIds = fila.map(f => f.usuario_id)
  if (new Set(usuarioIds).size !== usuarioIds.length) {
    throw new Error('um médico não pode ocupar duas posições na mesma fila')
  }

  const invalidos = await usuariosSemRoleMedico(usuarioIds)
  if (invalidos.length > 0) {
    throw new Error(`Usuários que não são médicos (anestesita_socio ou anestesita_plantonista): ${invalidos.join(', ')}`)
  }

  if (janela) {
    const ocupados = await usuariosComConflito(usuarioIds, janela.data, janela.horaInicio, janela.horaFim, janela.excluirPlantaoId)
    if (ocupados.size > 0) {
      throw new Error(`Médico(s) já escalado(s) em outro plantão nesse horário: ${[...ocupados].join(', ')}`)
    }
  }

  return fila.map(({ usuario_id, posicao }) => ({ usuario_id, is_coordenador: false, posicao }))
}

async function usuariosSemRoleMedico(usuarioIds) {
  const idsUnicos = [...new Set(usuarioIds)]

  const resultados = await Promise.all(
    idsUnicos.map(async id => {
      const { data, error } = await supabase.auth.admin.getUserById(id)
      const roles = data?.user?.app_metadata?.roles ?? []
      const valido = !error && roles.some(r => ROLES_MEDICO.includes(r))
      return { id, valido }
    })
  )

  return resultados.filter(r => !r.valido).map(r => r.id)
}

async function usuariosComConflito(usuarioIds, data, horaInicio, horaFim, excluirPlantaoId) {
  const idsUnicos = [...new Set(usuarioIds)]
  if (idsUnicos.length === 0) return new Set()

  const alvo = calcularJanela(data, horaInicio, horaFim)
  const dataAnterior = deslocarData(data, -1)
  const dataSeguinte = deslocarData(data, 1)

  const { data: plantoesProximos, error: plantoesError } = await supabase
    .from('plantoes')
    .select('id, data, hora_inicio, hora_fim')
    .gte('data', dataAnterior)
    .lte('data', dataSeguinte)

  if (plantoesError) throw plantoesError

  const plantoesConflitantes = plantoesProximos
    .filter(p => p.id !== excluirPlantaoId)
    .filter(p => seSobrepoe(alvo, calcularJanela(p.data, p.hora_inicio, p.hora_fim)))
  if (plantoesConflitantes.length === 0) return new Set()

  const { data: membros, error: membrosError } = await supabase
    .from('plantao_usuarios')
    .select('usuario_id')
    .in('plantao_id', plantoesConflitantes.map(p => p.id))
    .in('usuario_id', idsUnicos)

  if (membrosError) throw membrosError

  return new Set(membros.map(m => m.usuario_id))
}

function calcularJanela(data, horaInicio, horaFim) {
  const inicio = paraMinutosAbsolutos(data, horaInicio)
  let fim = paraMinutosAbsolutos(data, horaFim)
  if (fim <= inicio) fim += 24 * 60
  return { inicio, fim }
}

function paraMinutosAbsolutos(data, hora) {
  const diasEpoch = Math.floor(Date.parse(`${data}T00:00:00Z`) / 86400000)
  const [h, m] = hora.split(':').map(Number)
  return diasEpoch * 1440 + h * 60 + m
}

function seSobrepoe(a, b) {
  return a.inicio < b.fim && b.inicio < a.fim
}

function deslocarData(data, dias) {
  const d = new Date(`${data}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

async function buscarPerfis(usuarioIds) {
  const idsUnicos = [...new Set(usuarioIds)]
  if (idsUnicos.length === 0) return new Map()

  const { data, error } = await supabase
    .from('profiles')
    .select('id, nome, email, sigla')
    .in('id', idsUnicos)

  if (error) throw error

  return new Map(data.map(perfil => [perfil.id, perfil]))
}

async function buscarTrocasPendentesPorSlot(plantaoIds) {
  const idsUnicos = [...new Set(plantaoIds)]
  if (idsUnicos.length === 0) return new Map()

  const { data, error } = await supabase
    .from('plantao_trocas')
    .select('*')
    .in('plantao_id', idsUnicos)
    .eq('status', 'pendente')

  if (error) throw error

  const perfis = await buscarPerfis(data.flatMap(t => [t.usuario_entrada, t.solicitado_por]))

  return new Map(data.map(t => [
    `${t.plantao_id}:${t.usuario_saida}`,
    {
      id: t.id,
      solicitadoEm: t.solicitado_em,
      usuarioEntrada: perfis.get(t.usuario_entrada) ?? { id: t.usuario_entrada },
      solicitadoPor: perfis.get(t.solicitado_por) ?? { id: t.solicitado_por },
    },
  ]))
}

function formatTroca(row, perfis) {
  return {
    id: row.id,
    plantaoId: row.plantao_id,
    status: row.status,
    solicitadoEm: row.solicitado_em,
    respondidoEm: row.respondido_em,
    usuarioSaida: perfis.get(row.usuario_saida) ?? { id: row.usuario_saida },
    usuarioEntrada: perfis.get(row.usuario_entrada) ?? { id: row.usuario_entrada },
    solicitadoPor: perfis.get(row.solicitado_por) ?? { id: row.solicitado_por },
  }
}

function formatPlantao(row, perfis, trocasPendentes = new Map()) {
  const { plantao_usuarios, ...plantao } = row
  const usuarios = plantao_usuarios
    .map(u => ({
      ...(perfis.get(u.usuario_id) ?? { id: u.usuario_id }),
      coordenador: u.is_coordenador ?? false,
      posicao: u.posicao ?? null,
      trocaPendente: trocasPendentes.get(`${plantao.id}:${u.usuario_id}`) ?? null,
    }))
    .sort((a, b) => (a.posicao ?? 0) - (b.posicao ?? 0))

  return { ...plantao, usuarios }
}
