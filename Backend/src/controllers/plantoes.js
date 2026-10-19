const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const { ROTULO_TIPO, buscarAfastamentosNoPeriodo, afastamentoEm, usuariosAfastados } = require('../services/afastamentos')

const { ehGestao } = require('../middleware/auth')
const {
  POSICOES, vagaExisteNoDia, ehVagaDeCoordenador, turnoDaPosicao, horarioDaVaga, turnoJaComecou, turnoJaTerminou,
} = require('../services/posicoes')
const { dataDaCobertura, validarIntervalo, buscarCoberturas } = require('../services/coberturas')
const { usuariosComConflito } = require('../services/conflitos')
const { respondenteDaTroca, trocaVencida } = require('../services/trocas')
const { esvaziarVaga } = require('../services/escalas')
const { estaDesativado } = require('../services/usuarios')

const ROLES_MEDICO = ['anestesita_plantonista', 'anestesita_socio']
// Um plantão por dia, com as vagas do diurno e do noturno (services/posicoes.js)
const SELECT_PLANTAO = '*, plantao_usuarios(usuario_id, posicao)'

exports.createPlantao = async (req, res) => {
  const { titulo, descricao, data, fila } = req.body

  if (!titulo || !data) {
    return res.status(400).json({ error: 'titulo e data são obrigatórios' })
  }

  let membros
  try {
    membros = await validarFila(fila, { data })
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }

  const { data: plantao, error } = await supabase
    .from('plantoes')
    .insert({
      titulo,
      descricao: descricao ?? null,
      data,
      criado_por: req.user.id,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Já existe um plantão nesse dia' })
    return res.status(400).json({ error: error.message })
  }

  const { error: membrosError } = await supabase
    .from('plantao_usuarios')
    .insert(membros.map(m => ({ plantao_id: plantao.id, ...m })))

  if (membrosError) {
    // Sem os médicos o plantão ficaria vazio no calendário: desfaz a criação
    await supabase.from('plantoes').delete().eq('id', plantao.id)
    return res.status(400).json({ error: membrosError.message })
  }

  try {
    const perfis = await buscarPerfis(membros.map(m => m.usuario_id))
    const linha = { ...plantao, plantao_usuarios: membros }
    return res.status(201).json(formatPlantao(linha, perfis, new Map(), await buscarAfastamentosDosPlantoes([linha])))
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

exports.listPlantoes = async (req, res) => {
  const { inicio, fim } = req.query

  let query = supabase
    .from('plantoes')
    .select(SELECT_PLANTAO)
    .order('data', { ascending: true })

  if (inicio) query = query.gte('data', inicio)
  if (fim) query = query.lte('data', fim)

  const { data, error } = await query

  if (error) return res.status(500).json({ error: error.message })

  try {
    const perfis = await buscarPerfis(data.flatMap(row => row.plantao_usuarios.map(u => u.usuario_id)))
    const trocasPendentes = await buscarTrocasPendentesPorSlot(data.map(row => row.id))
    const afastamentos = await buscarAfastamentosDosPlantoes(data)
    const coberturas = await buscarCoberturasPorSlot(data.map(row => row.id))
    return res.json(data.map(row => formatPlantao(row, perfis, trocasPendentes, afastamentos, coberturas)))
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
// API 
exports.getPlantao = async (req, res) => {
  const { data, error } = await supabase
    .from('plantoes')
    .select(SELECT_PLANTAO)
    .eq('id', req.params.id)
    .maybeSingle()

  if (error) return res.status(500).json({ error: error.message })
  if (!data) return res.status(404).json({ error: 'Plantão não encontrado' })

  try {
    const perfis = await buscarPerfis(data.plantao_usuarios.map(u => u.usuario_id))
    const trocasPendentes = await buscarTrocasPendentesPorSlot([data.id])
    const coberturas = await buscarCoberturasPorSlot([data.id])
    return res.json(formatPlantao(data, perfis, trocasPendentes, await buscarAfastamentosDosPlantoes([data]), coberturas))
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

exports.updatePlantao = async (req, res) => {
  const { titulo, descricao, data } = req.body

  const updates = {}
  if (titulo !== undefined) updates.titulo = titulo
  if (descricao !== undefined) updates.descricao = descricao || null
  if (data !== undefined) updates.data = data

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Nenhum campo para atualizar' })
  }

  // A tela manda o dia mesmo quando só o título mudou: compara com o que está gravado
  // para só validar o que mudou de fato
  const { data: atual, error: atualError } = await supabase
    .from('plantoes')
    .select('id, data, plantao_usuarios(usuario_id, posicao)')
    .eq('id', req.params.id)
    .maybeSingle()

  if (atualError) return res.status(500).json({ error: atualError.message })
  if (!atual) return res.status(404).json({ error: 'Plantão não encontrado' })

  // Mudou o dia: cada médico precisa estar livre no horário da sua vaga no novo dia, e sem afastamento
  if (data !== undefined && data !== atual.data) {
    try {
      // O intervalo de uma troca por horas valendo foi combinado para aquele dia
      if ((await buscarCoberturas([atual.id])).length > 0) {
        return res.status(400).json({ error: 'Esse plantão tem troca por horas valendo. Cancele-a antes de mudar o dia.' })
      }

      if (atual.plantao_usuarios.some(u => !vagaExisteNoDia(data, u.posicao))) {
        return res.status(400).json({ error: 'A vaga do 7º não existe no fim de semana. Esvazie-a antes de mudar o dia.' })
      }

      // As vagas atuais ainda estão no dia antigo e não contam como conflito
      const ignorar = atual.plantao_usuarios.map(u => ({ plantao_id: atual.id, posicao: u.posicao }))
      await validarHorariosLivres(atual.plantao_usuarios, data, { ignorar })
      await validarSemAfastamento(atual.plantao_usuarios.map(u => u.usuario_id), data)
    } catch (err) {
      return res.status(400).json({ error: err.message })
    }
  }

  const { data: plantao, error } = await supabase
    .from('plantoes')
    .update(updates)
    .eq('id', req.params.id)
    .select(SELECT_PLANTAO)
    .maybeSingle()

  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Já existe um plantão nesse dia' })
    return res.status(400).json({ error: error.message })
  }
  if (!plantao) return res.status(404).json({ error: 'Plantão não encontrado' })

  try {
    const perfis = await buscarPerfis(plantao.plantao_usuarios.map(u => u.usuario_id))
    const trocasPendentes = await buscarTrocasPendentesPorSlot([plantao.id])
    const coberturas = await buscarCoberturasPorSlot([plantao.id])
    return res.json(formatPlantao(plantao, perfis, trocasPendentes, await buscarAfastamentosDosPlantoes([plantao]), coberturas))
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

// Esvazia uma vaga. É pela vaga, e não pelo médico, porque o mesmo médico pode estar no diurno e no noturno
exports.removerDaVaga = async (req, res) => {
  const posicao = Number(req.params.posicao)

  const { data: plantao, error: plantaoError } = await supabase
    .from('plantoes')
    .select('id, plantao_usuarios(id, usuario_id, posicao)')
    .eq('id', req.params.id)
    .maybeSingle()

  if (plantaoError) return res.status(500).json({ error: plantaoError.message })
  if (!plantao) return res.status(404).json({ error: 'Plantão não encontrado' })

  const membro = plantao.plantao_usuarios.find(u => u.posicao === posicao)
  if (!membro) return res.status(404).json({ error: 'Essa vaga já está vazia' })

  try {
    await esvaziarVaga(plantao.id, membro, req.user.id)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }

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

// Move o médico de uma vaga para outra do mesmo plantão, inclusive entre o diurno e o noturno. Se a vaga nova
// estiver ocupada, os dois trocam de lugar. Vale na hora (sem aceite) e fica registrado em plantao_mudancas_posicao.
exports.alterarPosicao = async (req, res) => {
  const { posicao, nova_posicao } = req.body

  if (!POSICOES.includes(posicao) || !POSICOES.includes(nova_posicao)) {
    return res.status(400).json({ error: `posicao e nova_posicao são obrigatórias (vagas de 1 a ${POSICOES.length})` })
  }
  if (posicao === nova_posicao) return res.json({ message: 'Posição mantida' })

  const { data: plantao, error: plantaoError } = await supabase
    .from('plantoes')
    .select('id, data, plantao_usuarios(id, usuario_id, posicao)')
    .eq('id', req.params.id)
    .maybeSingle()

  if (plantaoError) return res.status(500).json({ error: plantaoError.message })
  if (!plantao) return res.status(404).json({ error: 'Plantão não encontrado' })
  if (!vagaExisteNoDia(plantao.data, nova_posicao)) {
    return res.status(400).json({ error: 'Essa vaga não existe no fim de semana' })
  }

  // Fora da gestão, só quem está escalado nesse plantão mexe nas posições dele
  if (!ehGestao(req.user) && !plantao.plantao_usuarios.some(u => u.usuario_id === req.user.id)) {
    return res.status(403).json({ error: 'Você só pode mudar posições nos plantões em que está escalado' })
  }

  const membro = plantao.plantao_usuarios.find(u => u.posicao === posicao)
  if (!membro) return res.status(404).json({ error: 'Essa vaga está vazia' })

  const ocupante = plantao.plantao_usuarios.find(u => u.posicao === nova_posicao)
  // O mesmo médico nas duas vagas (uma no diurno e outra no noturno): trocar não muda nada
  if (ocupante?.usuario_id === membro.usuario_id) return res.json({ message: 'Posição mantida' })

  // Troca pendente e troca por horas são da vaga: mudar quem está nela no meio do caminho embaralharia o pedido
  const { data: trocasDasVagas, error: trocasError } = await supabase
    .from('plantao_trocas')
    .select('id')
    .eq('plantao_id', plantao.id)
    .in('posicao', [posicao, nova_posicao])
    .or('status.eq.pendente,and(status.eq.aceita,hora_inicio.not.is.null)')
    .limit(1)

  if (trocasError) return res.status(500).json({ error: trocasError.message })
  if (trocasDasVagas.length > 0) {
    return res.status(400).json({
      error: 'Essa vaga tem pedido de troca pendente ou troca por horas valendo. Cancele antes de mudar a posição.'
    })
  }

  // Entre vagas de horários diferentes (o diurno e o noturno, ou a manhã do fim de semana), cada um precisa
  // estar livre no horário para onde vai
  const horario = p => {
    const { hora_inicio, hora_fim } = horarioDaVaga(plantao, p)
    return `${hora_inicio}-${hora_fim}`
  }
  if (horario(posicao) !== horario(nova_posicao)) {
    const indo = [{ usuario_id: membro.usuario_id, posicao: nova_posicao }]
    if (ocupante) indo.push({ usuario_id: ocupante.usuario_id, posicao })
    const ignorar = [{ plantao_id: plantao.id, posicao }, { plantao_id: plantao.id, posicao: nova_posicao }]
    try {
      await validarHorariosLivres(indo, plantao.data, { ignorar })
    } catch (err) {
      return res.status(400).json({ error: err.message })
    }
  }

  const moverPara = (linhaId, novaPosicao) => supabase
    .from('plantao_usuarios')
    .update({ posicao: novaPosicao })
    .eq('id', linhaId)

  if (ocupante) {
    // A vaga é única por plantão: libera a do médico antes de mover o ocupante para ela
    const passos = [
      () => moverPara(membro.id, null),
      () => moverPara(ocupante.id, posicao),
      () => moverPara(membro.id, nova_posicao),
    ]
    for (const [i, passo] of passos.entries()) {
      const { error } = await passo()
      if (error) {
        // Desfaz o que já foi feito para não deixar o plantão pela metade
        if (i >= 2) await moverPara(ocupante.id, nova_posicao)
        if (i >= 1) await moverPara(membro.id, posicao)
        return res.status(400).json({ error: error.message })
      }
    }
  } else {
    const { error } = await moverPara(membro.id, nova_posicao)
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Essa vaga acabou de ser ocupada. Recarregue o plantão.' })
      return res.status(400).json({ error: error.message })
    }
    await cancelarPedidosDasVagas(plantao.id, [nova_posicao], req.user.id)
  }

  const { error: logError } = await supabase
    .from('plantao_mudancas_posicao')
    .insert({
      plantao_id: plantao.id,
      usuario_id: membro.usuario_id,
      posicao_anterior: posicao,
      posicao_nova: nova_posicao,
      usuario_trocado_id: ocupante?.usuario_id ?? null,
      alterado_por: req.user.id,
    })

  if (logError) return res.status(500).json({ error: `Posição alterada, mas o histórico não foi gravado: ${logError.message}` })

  return res.json({ message: ocupante ? 'Posições trocadas' : 'Posição alterada' })
}

exports.listarMudancasPosicaoDoPlantao = async (req, res) => {
  const { data, error } = await supabase
    .from('plantao_mudancas_posicao')
    .select('*')
    .eq('plantao_id', req.params.id)
    .order('alterado_em', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })

  try {
    const perfis = await buscarPerfis(data.flatMap(m => [m.usuario_id, m.usuario_trocado_id, m.alterado_por].filter(Boolean)))
    return res.json(data.map(m => ({
      id: m.id,
      alteradoEm: m.alterado_em,
      posicaoAnterior: m.posicao_anterior,
      posicaoNova: m.posicao_nova,
      usuario: perfis.get(m.usuario_id) ?? { id: m.usuario_id },
      usuarioTrocado: m.usuario_trocado_id ? perfis.get(m.usuario_trocado_id) ?? { id: m.usuario_trocado_id } : null,
      alteradoPor: perfis.get(m.alterado_por) ?? { id: m.alterado_por },
    })))
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

// Preenche vagas vazias. Quem já está no mesmo turno desse plantão aparece como ocupado
exports.addUsuarios = async (req, res) => {
  const { data: plantao, error: plantaoError } = await supabase
    .from('plantoes')
    .select('id, data')
    .eq('id', req.params.id)
    .maybeSingle()

  if (plantaoError) return res.status(500).json({ error: plantaoError.message })
  if (!plantao) return res.status(404).json({ error: 'Plantão não encontrado' })

  let membros
  try {
    membros = await validarFila(req.body.fila, { data: plantao.data })
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }

  const { error } = await supabase
    .from('plantao_usuarios')
    .insert(membros.map(m => ({ plantao_id: plantao.id, ...m })))

  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Essa vaga já está ocupada' })
    return res.status(400).json({ error: error.message })
  }

  await cancelarPedidosDasVagas(plantao.id, membros.map(m => m.posicao), req.user.id)

  return res.status(201).json({ message: 'Médicos adicionados ao plantão' })
}

// A troca é de uma vaga (posicao): quem está nela sai e usuario_entrada entra.
// Sem hora_inicio/hora_fim troca a vaga inteira; com eles é a troca por horas (o convidado cobre só o intervalo)
exports.criarTroca = async (req, res) => {
  const { posicao, usuario_entrada, hora_inicio = null, hora_fim = null } = req.body
  const parcial = hora_inicio != null || hora_fim != null

  if (!POSICOES.includes(posicao) || !usuario_entrada) {
    return res.status(400).json({ error: 'posicao (a vaga) e usuario_entrada são obrigatórios' })
  }

  const { data: plantao, error: plantaoError } = await supabase
    .from('plantoes')
    .select('id, data, plantao_usuarios(usuario_id, posicao)')
    .eq('id', req.params.id)
    .maybeSingle()

  if (plantaoError) return res.status(500).json({ error: plantaoError.message })
  if (!plantao) return res.status(404).json({ error: 'Plantão não encontrado' })
  if (!ehGestao(req.user) && turnoJaTerminou(plantao.data, posicao)) {
    return res.status(400).json({ error: 'O turno dessa vaga já terminou. Só a gestão pode registrar essa troca.' })
  }

  const titular = plantao.plantao_usuarios.find(u => u.posicao === posicao)
  if (!titular) return res.status(400).json({ error: 'Essa vaga está vazia' })
  const usuario_saida = titular.usuario_id

  if (usuario_saida === usuario_entrada) {
    return res.status(400).json({ error: 'Esse médico já está nessa vaga' })
  }
  // Médico fora da gestão pede a troca da própria vaga ou a vaga de alguém para si
  if (!ehGestao(req.user) && req.user.id !== usuario_saida && req.user.id !== usuario_entrada) {
    return res.status(403).json({ error: 'Você só pode pedir a troca da sua vaga ou pedir a vaga de alguém para você' })
  }

  const horario = horarioDaVaga(plantao, posicao)
  if (parcial) {
    const erroIntervalo = validarIntervalo(horario, hora_inicio, hora_fim)
    if (erroIntervalo) return res.status(400).json({ error: erroIntervalo })
  }

  try {
    const invalidos = await usuariosSemRoleMedico([usuario_entrada])
    if (invalidos.length > 0) {
      return res.status(400).json({ error: 'usuario_entrada precisa ser um médico ativo (anestesita_socio ou anestesita_plantonista)' })
    }

    // Uma vaga tem no máximo uma troca por horas valendo; com ela ativa, nem a troca inteira é aceita
    if ((await buscarCoberturas([plantao.id])).some(c => c.posicao === posicao)) {
      return res.status(400).json({ error: 'Essa vaga já tem uma troca por horas valendo. A gestão precisa cancelá-la antes.' })
    }

    // O convidado precisa estar livre no horário da vaga (na troca por horas, só no intervalo que vai cobrir).
    // Quem já está no mesmo turno desse plantão conta como ocupado
    const janela = parcial
      ? { data: dataDaCobertura(horario, hora_inicio), hora_inicio, hora_fim }
      : horario
    if ((await usuariosComConflito([usuario_entrada], janela)).size > 0) {
      return res.status(400).json({ error: 'usuario_entrada já está escalado nesse horário' })
    }

    await validarSemAfastamento([usuario_entrada], plantao.data)
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }

  const { data: troca, error } = await supabase
    .from('plantao_trocas')
    .insert({
      plantao_id: plantao.id,
      posicao,
      usuario_saida,
      usuario_entrada,
      solicitado_por: req.user.id,
      hora_inicio: parcial ? hora_inicio : null,
      hora_fim: parcial ? hora_fim : null,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Já existe uma troca pendente para essa vaga' })
    return res.status(400).json({ error: error.message })
  }

  try {
    const perfis = await buscarPerfis([usuario_saida, usuario_entrada, req.user.id])
    return res.status(201).json(formatTroca(troca, perfis))
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

// Cancela um pedido de troca pendente (quem pediu ou a gestão) ou desfaz uma troca por horas já aceita
// (só a gestão: a vaga volta inteira para o titular). Troca da vaga inteira já aceita não se desfaz.
exports.cancelarTroca = async (req, res) => {
  const { data: troca, error: trocaError } = await supabase
    .from('plantao_trocas')
    .select('id, status, solicitado_por, hora_inicio')
    .eq('id', req.params.trocaId)
    .eq('plantao_id', req.params.id)
    .maybeSingle()

  if (trocaError) return res.status(500).json({ error: trocaError.message })
  if (!troca) return res.status(404).json({ error: 'Troca não encontrada' })

  const gestao = ehGestao(req.user)
  if (troca.status === 'pendente') {
    if (!gestao && troca.solicitado_por !== req.user.id) {
      return res.status(403).json({ error: 'Só quem pediu a troca ou a gestão pode cancelar o pedido' })
    }
  } else if (troca.status === 'aceita' && troca.hora_inicio) {
    if (!gestao) return res.status(403).json({ error: 'Só a gestão pode desfazer uma troca por horas' })
  } else {
    return res.status(400).json({ error: 'Essa troca não pode mais ser cancelada' })
  }

  // Só passa se ninguém respondeu ou cancelou nesse meio-tempo
  const { data, error } = await supabase
    .from('plantao_trocas')
    .update({ status: 'cancelada', respondido_em: new Date().toISOString() })
    .eq('id', troca.id)
    .eq('status', troca.status)
    .select('id')

  if (error) return res.status(400).json({ error: error.message })
  if (!data || data.length === 0) {
    return res.status(409).json({ error: 'Essa troca acabou de ser respondida ou cancelada. Recarregue o plantão.' })
  }

  return res.status(204).send()
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
  const { data: envolvido, error } = await supabase
    .from('plantao_trocas')
    .select('*, plantoes(id, titulo, data)')
    .or(`usuario_entrada.eq.${req.user.id},usuario_saida.eq.${req.user.id}`)
    .eq('status', 'pendente')
    .order('solicitado_em', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })

  const data = envolvido.filter(t => respondenteDaTroca(t) === req.user.id && !trocaVencida(t, t.plantoes?.data))

  try {
    const ids = data.flatMap(t => [t.usuario_saida, t.usuario_entrada, t.solicitado_por])
    const perfis = await buscarPerfis(ids)
    // O horário mostrado é o da vaga trocada (o turno dela)
    return res.json(data.map(({ plantoes: plantao, ...t }) => ({
      ...formatTroca(t, perfis),
      plantao: plantao && { ...plantao, ...horarioDaVaga(plantao, t.posicao) },
    })))
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
  if (respondenteDaTroca(troca) !== req.user.id) {
    return res.status(403).json({ error: 'Essa solicitação não está esperando a sua resposta' })
  }
  // Quem responde pode ser quem entra ou, quando ele mesmo pediu a vaga, o titular
  const quemEntra = troca.usuario_entrada === req.user.id ? 'Você' : 'O médico que entra'
  if (troca.status !== 'pendente') {
    return res.status(400).json({ error: 'Essa solicitação já foi respondida ou cancelada' })
  }

  if (aceitar) {
    const { data: plantao, error: plantaoError } = await supabase
      .from('plantoes')
      .select('id, data, plantao_usuarios(usuario_id, posicao)')
      .eq('id', troca.plantao_id)
      .maybeSingle()

    if (plantaoError) return res.status(500).json({ error: plantaoError.message })
    // A vaga pode ter mudado de mãos enquanto o pedido esperava
    const titularContinua = plantao?.plantao_usuarios.some(u => u.posicao === troca.posicao && u.usuario_id === troca.usuario_saida)
    if (!titularContinua) return res.status(409).json({ error: 'O médico que está saindo não está mais nessa vaga' })
    if (trocaVencida(troca, plantao.data)) {
      return res.status(409).json({ error: 'O turno dessa vaga já terminou e o pedido venceu' })
    }

    try {
      if ((await usuariosAfastados([troca.usuario_entrada], plantao.data)).size > 0) {
        return res.status(409).json({ error: `${quemEntra} está de férias ou em congresso no dia desse plantão` })
      }

      // A troca pode ter ficado dias pendente: confere de novo se o convidado continua livre nesse horário
      // (na troca por horas, só no intervalo que ele vai cobrir)
      const horario = horarioDaVaga(plantao, troca.posicao)
      const janela = troca.hora_inicio
        ? { data: dataDaCobertura(horario, troca.hora_inicio), hora_inicio: troca.hora_inicio, hora_fim: troca.hora_fim }
        : horario
      if ((await usuariosComConflito([troca.usuario_entrada], janela)).size > 0) {
        return res.status(409).json({ error: `${quemEntra} já está escalado nesse horário` })
      }

      if (troca.hora_inicio && (await buscarCoberturas([troca.plantao_id])).some(c => c.posicao === troca.posicao)) {
        return res.status(409).json({ error: 'Essa vaga já tem outra troca por horas valendo' })
      }
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  }

  // Reserva a troca antes de mexer na vaga: só uma resposta passa, mesmo com dois cliques ao mesmo tempo
  const { data: atualizada, error } = await supabase
    .from('plantao_trocas')
    .update({ status: aceitar ? 'aceita' : 'recusada', respondido_em: new Date().toISOString() })
    .eq('id', req.params.trocaId)
    .eq('status', 'pendente')
    .select()
    .maybeSingle()

  if (error) return res.status(400).json({ error: error.message })
  if (!atualizada) return res.status(400).json({ error: 'Essa solicitação já foi respondida ou cancelada' })

  // Troca por horas não mexe na vaga: ela continua do titular e a troca aceita é a cobertura
  if (aceitar && !troca.hora_inicio) {
    const { data: linhasAtualizadas, error: swapError } = await supabase
      .from('plantao_usuarios')
      .update({ usuario_id: troca.usuario_entrada })
      .eq('plantao_id', troca.plantao_id)
      .eq('posicao', troca.posicao)
      .eq('usuario_id', troca.usuario_saida)
      .select()

    if (swapError || !linhasAtualizadas || linhasAtualizadas.length === 0) {
      // A vaga não mudou: a troca volta a ficar pendente
      await supabase
        .from('plantao_trocas')
        .update({ status: 'pendente', respondido_em: null })
        .eq('id', req.params.trocaId)

      if (swapError) return res.status(400).json({ error: swapError.message })
      return res.status(409).json({ error: 'O médico que está saindo não está mais nessa vaga' })
    }
  }

  try {
    const perfis = await buscarPerfis([atualizada.usuario_saida, atualizada.usuario_entrada, atualizada.solicitado_por])
    return res.json(formatTroca(atualizada, perfis))
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

// Cada médico numa vaga do plantão (services/posicoes.js). O mesmo médico pode estar no diurno e no noturno,
// mas não em duas vagas do mesmo turno
// Pedido de vaga livre: o médico pede para entrar numa vaga vazia e a gestão aprova ou recusa.
// As regras da escala (uma vaga por turno, sem conflito de horário, sem férias aprovadas) valem no pedido
// e de novo na aprovação, porque a escala pode ter mudado no meio do caminho
exports.pedirVaga = async (req, res) => {
  const { posicao } = req.body

  if (!POSICOES.includes(posicao)) {
    return res.status(400).json({ error: `posicao é obrigatória (vaga de 1 a ${POSICOES.length})` })
  }

  const { data: plantao, error: plantaoError } = await supabase
    .from('plantoes')
    .select('id, data, plantao_usuarios(usuario_id, posicao)')
    .eq('id', req.params.id)
    .maybeSingle()

  if (plantaoError) return res.status(500).json({ error: plantaoError.message })
  if (!plantao) return res.status(404).json({ error: 'Plantão não encontrado' })

  if (!vagaExisteNoDia(plantao.data, posicao)) {
    return res.status(400).json({ error: 'Essa vaga não existe no fim de semana' })
  }
  if (plantao.plantao_usuarios.some(u => u.posicao === posicao)) {
    return res.status(400).json({ error: 'Essa vaga já está ocupada' })
  }
  if (turnoJaComecou(plantao.data, posicao)) {
    return res.status(400).json({ error: 'O turno dessa vaga já começou' })
  }

  try {
    await validarEntradaNaVaga(req.user.id, plantao, posicao, 'Você já está escalado nesse horário')
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }

  const { data: pedido, error } = await supabase
    .from('plantao_pedidos_vaga')
    .insert({ plantao_id: plantao.id, posicao, usuario_id: req.user.id })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Você já pediu essa vaga' })
    return res.status(400).json({ error: error.message })
  }

  try {
    return res.status(201).json(formatPedidoVaga(pedido, await buscarPerfis([req.user.id])))
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

// Todos os pedidos do plantão (o modal mostra os pendentes na vaga e o resto no histórico)
exports.listarPedidosVagaDoPlantao = async (req, res) => {
  const { data, error } = await supabase
    .from('plantao_pedidos_vaga')
    .select('*')
    .eq('plantao_id', req.params.id)
    .order('solicitado_em', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })

  try {
    const perfis = await buscarPerfis(data.flatMap(p => [p.usuario_id, p.respondido_por]).filter(Boolean))
    return res.json(data.map(p => formatPedidoVaga(p, perfis)))
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

// Pedidos aguardando a gestão, de todos os plantões (sino de notificações)
exports.listarPedidosVagaPendentes = async (req, res) => {
  const { data, error } = await supabase
    .from('plantao_pedidos_vaga')
    .select('*, plantoes(id, titulo, data)')
    .eq('status', 'pendente')
    .order('solicitado_em', { ascending: true })

  if (error) return res.status(500).json({ error: error.message })

  try {
    const perfis = await buscarPerfis(data.map(p => p.usuario_id))
    return res.json(data.map(({ plantoes: plantao, ...p }) => ({
      ...formatPedidoVaga(p, perfis),
      plantao: plantao && { ...plantao, ...horarioDaVaga(plantao, p.posicao) },
    })))
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

exports.responderPedidoVaga = (aprovar) => async (req, res) => {
  const { data: pedido, error: pedidoError } = await supabase
    .from('plantao_pedidos_vaga')
    .select('*, plantoes(id, data, plantao_usuarios(usuario_id, posicao))')
    .eq('id', req.params.pedidoId)
    .maybeSingle()

  if (pedidoError) return res.status(500).json({ error: pedidoError.message })
  if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado' })
  if (pedido.status !== 'pendente') return res.status(400).json({ error: 'Esse pedido já foi respondido ou cancelado' })

  const plantao = pedido.plantoes

  if (aprovar) {
    if (plantao.plantao_usuarios.some(u => u.posicao === pedido.posicao)) {
      return res.status(409).json({ error: 'Essa vaga já foi preenchida' })
    }
    try {
      if ((await usuariosSemRoleMedico([pedido.usuario_id])).length > 0) {
        return res.status(400).json({ error: 'Quem pediu a vaga não é mais médico (sócio ou plantonista)' })
      }
      const perfil = (await buscarPerfis([pedido.usuario_id])).get(pedido.usuario_id)
      const nome = perfil?.nome ?? perfil?.email ?? 'O médico'
      await validarEntradaNaVaga(pedido.usuario_id, plantao, pedido.posicao, `${nome} já está escalado nesse horário`)
    } catch (err) {
      return res.status(400).json({ error: err.message })
    }
  }

  // Reserva a resposta antes de mexer na vaga: só uma resposta passa, mesmo com dois cliques ao mesmo tempo
  const respondidoEm = new Date().toISOString()
  const { data: respondido, error } = await supabase
    .from('plantao_pedidos_vaga')
    .update({ status: aprovar ? 'aprovado' : 'recusado', respondido_por: req.user.id, respondido_em: respondidoEm })
    .eq('id', pedido.id)
    .eq('status', 'pendente')
    .select()
    .maybeSingle()

  if (error) return res.status(400).json({ error: error.message })
  if (!respondido) return res.status(400).json({ error: 'Esse pedido já foi respondido ou cancelado' })

  if (aprovar) {
    const { error: vagaError } = await supabase
      .from('plantao_usuarios')
      .insert({ plantao_id: plantao.id, usuario_id: pedido.usuario_id, posicao: pedido.posicao })

    if (vagaError) {
      // O médico não entrou: o pedido volta a ficar pendente
      await supabase
        .from('plantao_pedidos_vaga')
        .update({ status: 'pendente', respondido_por: null, respondido_em: null })
        .eq('id', pedido.id)
      if (vagaError.code === '23505') return res.status(409).json({ error: 'Essa vaga acabou de ser preenchida' })
      return res.status(400).json({ error: vagaError.message })
    }

    // Os outros pedidos da vaga são recusados; os outros pedidos desse médico no mesmo turno perdem o sentido
    const vagasDoTurno = POSICOES.filter(p => turnoDaPosicao(p) === turnoDaPosicao(pedido.posicao))
    await Promise.all([
      supabase
        .from('plantao_pedidos_vaga')
        .update({ status: 'recusado', respondido_por: req.user.id, respondido_em: respondidoEm })
        .eq('plantao_id', plantao.id)
        .eq('posicao', pedido.posicao)
        .eq('status', 'pendente'),
      supabase
        .from('plantao_pedidos_vaga')
        .update({ status: 'cancelado', respondido_por: req.user.id, respondido_em: respondidoEm })
        .eq('plantao_id', plantao.id)
        .eq('usuario_id', pedido.usuario_id)
        .in('posicao', vagasDoTurno)
        .eq('status', 'pendente'),
    ])
  }

  try {
    const perfis = await buscarPerfis([respondido.usuario_id, req.user.id])
    return res.json(formatPedidoVaga(respondido, perfis))
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

// O médico desiste do próprio pedido (a gestão também pode cancelar)
exports.cancelarPedidoVaga = async (req, res) => {
  const { data: pedido, error: pedidoError } = await supabase
    .from('plantao_pedidos_vaga')
    .select('id, usuario_id, status')
    .eq('id', req.params.pedidoId)
    .maybeSingle()

  if (pedidoError) return res.status(500).json({ error: pedidoError.message })
  if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado' })
  if (!ehGestao(req.user) && pedido.usuario_id !== req.user.id) {
    return res.status(403).json({ error: 'Você só pode cancelar os seus pedidos' })
  }

  const { data: cancelado, error } = await supabase
    .from('plantao_pedidos_vaga')
    .update({ status: 'cancelado', respondido_por: req.user.id, respondido_em: new Date().toISOString() })
    .eq('id', pedido.id)
    .eq('status', 'pendente')
    .select()
    .maybeSingle()

  if (error) return res.status(400).json({ error: error.message })
  if (!cancelado) return res.status(400).json({ error: 'Esse pedido já foi respondido ou cancelado' })

  try {
    return res.json(formatPedidoVaga(cancelado, await buscarPerfis([cancelado.usuario_id, req.user.id])))
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

// Erro se o médico não puder entrar na vaga: já está no turno (aqui ou em outro plantão), tem conflito
// de horário ou está de férias/congresso aprovados nesse dia
async function validarEntradaNaVaga(usuarioId, plantao, posicao, mensagemConflito) {
  if ((await usuariosComConflito([usuarioId], horarioDaVaga(plantao, posicao))).size > 0) {
    throw new Error(mensagemConflito)
  }
  await validarSemAfastamento([usuarioId], plantao.data)
}

// A vaga foi preenchida pela gestão: os pedidos pendentes dela deixam de valer
async function cancelarPedidosDasVagas(plantaoId, posicoes, porId) {
  const { error } = await supabase
    .from('plantao_pedidos_vaga')
    .update({ status: 'cancelado', respondido_por: porId, respondido_em: new Date().toISOString() })
    .eq('plantao_id', plantaoId)
    .in('posicao', posicoes)
    .eq('status', 'pendente')
  if (error) console.error('Falha ao cancelar pedidos de vaga:', error.message)
}

function formatPedidoVaga(row, perfis) {
  return {
    id: row.id,
    plantaoId: row.plantao_id,
    posicao: row.posicao,
    status: row.status,
    solicitadoEm: row.solicitado_em,
    respondidoEm: row.respondido_em,
    usuario: perfis.get(row.usuario_id) ?? { id: row.usuario_id },
    respondidoPor: row.respondido_por ? perfis.get(row.respondido_por) ?? { id: row.respondido_por } : null,
  }
}

async function validarFila(fila, { data }) {
  if (!Array.isArray(fila) || fila.length === 0) {
    throw new Error('fila deve ser um array não vazio de { usuario_id, posicao }')
  }

  if (fila.some(f => !f?.usuario_id || !POSICOES.includes(f.posicao))) {
    throw new Error(`cada item da fila precisa de usuario_id e posicao (vaga de 1 a ${POSICOES.length})`)
  }
  if (fila.some(f => !vagaExisteNoDia(data, f.posicao))) {
    throw new Error('A vaga do 7º não existe no fim de semana')
  }

  const posicoes = fila.map(f => f.posicao)
  if (new Set(posicoes).size !== posicoes.length) {
    throw new Error('as vagas da fila não podem se repetir')
  }

  const porTurno = fila.map(f => `${turnoDaPosicao(f.posicao)}:${f.usuario_id}`)
  if (new Set(porTurno).size !== porTurno.length) {
    throw new Error('um médico não pode ocupar duas vagas do mesmo turno')
  }

  const usuarioIds = [...new Set(fila.map(f => f.usuario_id))]
  const invalidos = await usuariosSemRoleMedico(usuarioIds)
  if (invalidos.length > 0) {
    throw new Error(`Usuários que não são médicos ativos (anestesita_socio ou anestesita_plantonista): ${invalidos.join(', ')}`)
  }

  await validarHorariosLivres(fila, data)
  await validarSemAfastamento(usuarioIds, data)

  return fila.map(({ usuario_id, posicao }) => ({ usuario_id, posicao }))
}

// Erro se algum médico já estiver ocupado no horário da vaga que vai ocupar nesse dia
async function validarHorariosLivres(membros, data, { ignorar = [] } = {}) {
  // Uma consulta por horário: o diurno, o noturno e, no fim de semana, a manhã
  const porHorario = new Map()
  for (const m of membros) {
    const horario = horarioDaVaga({ data }, m.posicao)
    const chave = `${horario.hora_inicio}-${horario.hora_fim}`
    if (!porHorario.has(chave)) porHorario.set(chave, { horario, ids: [] })
    porHorario.get(chave).ids.push(m.usuario_id)
  }
  const ocupados = new Set()
  for (const { horario, ids } of porHorario.values()) {
    for (const id of await usuariosComConflito(ids, horario, { ignorar })) ocupados.add(id)
  }
  if (ocupados.size === 0) return

  const perfis = await buscarPerfis([...ocupados])
  const nomes = [...ocupados].map(id => perfis.get(id)?.nome ?? perfis.get(id)?.email ?? id)
  throw new Error(`Médico(s) já escalado(s) nesse horário: ${nomes.join(', ')}`)
}

async function usuariosSemRoleMedico(usuarioIds) {
  const idsUnicos = [...new Set(usuarioIds)]

  const resultados = await Promise.all(
    idsUnicos.map(async id => {
      const { data, error } = await supabase.auth.admin.getUserById(id)
      const roles = data?.user?.app_metadata?.roles ?? []
      // Conta desativada (ou cadastro ainda não aprovado) não entra em vaga nem em troca
      const valido = !error && roles.some(r => ROLES_MEDICO.includes(r)) && !estaDesativado(data.user)
      return { id, valido }
    })
  )

  return resultados.filter(r => !r.valido).map(r => r.id)
}

// Afastamentos (férias/congresso) dos médicos escalados, no intervalo de datas desses plantões.
// Inclui os pendentes, que aparecem com outro indicador para a gestão saber do pedido.
async function buscarAfastamentosDosPlantoes(rows) {
  if (rows.length === 0) return []
  const datas = rows.map(r => r.data).sort()
  const ids = rows.flatMap(r => (r.plantao_usuarios ?? []).map(u => u.usuario_id))
  return buscarAfastamentosNoPeriodo(ids, datas[0], datas[datas.length - 1], { incluirPendentes: true })
}

// Erro se algum dos médicos estiver de férias ou em congresso nessa data
async function validarSemAfastamento(usuarioIds, data) {
  const afastados = await usuariosAfastados(usuarioIds, data)
  if (afastados.size === 0) return

  const perfis = await buscarPerfis([...afastados.keys()])
  const descricao = [...afastados].map(([id, a]) => {
    const nome = perfis.get(id)?.nome ?? perfis.get(id)?.email ?? id
    return `${nome} (${ROTULO_TIPO[a.tipo]} até ${a.data_fim.split('-').reverse().join('/')})`
  })
  throw new Error(`Médico(s) indisponível(is) nesse dia: ${descricao.join(', ')}`)
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
    `${t.plantao_id}:${t.posicao}`,
    {
      id: t.id,
      solicitadoEm: t.solicitado_em,
      usuarioEntrada: perfis.get(t.usuario_entrada) ?? { id: t.usuario_entrada },
      solicitadoPor: perfis.get(t.solicitado_por) ?? { id: t.solicitado_por },
      respondenteId: respondenteDaTroca(t),
      horaInicio: t.hora_inicio,
      horaFim: t.hora_fim,
    },
  ]))
}

// Troca por horas valendo de cada vaga, pela chave "plantao:posicao"
async function buscarCoberturasPorSlot(plantaoIds) {
  const coberturas = await buscarCoberturas(plantaoIds)
  if (coberturas.length === 0) return new Map()
  const perfis = await buscarPerfis(coberturas.map(c => c.usuario_entrada))
  return new Map(coberturas.map(c => [
    `${c.plantao_id}:${c.posicao}`,
    {
      id: c.id,
      usuario: perfis.get(c.usuario_entrada) ?? { id: c.usuario_entrada },
      horaInicio: c.hora_inicio,
      horaFim: c.hora_fim,
    },
  ]))
}

function formatTroca(row, perfis) {
  return {
    id: row.id,
    plantaoId: row.plantao_id,
    posicao: row.posicao,
    status: row.status,
    solicitadoEm: row.solicitado_em,
    respondidoEm: row.respondido_em,
    usuarioSaida: perfis.get(row.usuario_saida) ?? { id: row.usuario_saida },
    usuarioEntrada: perfis.get(row.usuario_entrada) ?? { id: row.usuario_entrada },
    solicitadoPor: perfis.get(row.solicitado_por) ?? { id: row.solicitado_por },
    respondenteId: respondenteDaTroca(row),
    horaInicio: row.hora_inicio ?? null,
    horaFim: row.hora_fim ?? null,
  }
}

// Cada médico com a vaga que ocupa, na ordem da escala. Quem está no diurno e no noturno aparece duas vezes
function formatPlantao(row, perfis, trocasPendentes = new Map(), afastamentos = [], coberturas = new Map()) {
  const { plantao_usuarios, ...plantao } = row
  const usuarios = plantao_usuarios
    // Sem posição só no meio de uma troca de lugar entre duas vagas
    .filter(u => u.posicao != null)
    .map(u => ({
      ...(perfis.get(u.usuario_id) ?? { id: u.usuario_id }),
      posicao: u.posicao,
      coordenador: ehVagaDeCoordenador(u.posicao),
      trocaPendente: trocasPendentes.get(`${plantao.id}:${u.posicao}`) ?? null,
      afastamento: afastamentoEm(afastamentos, u.usuario_id, plantao.data),
      cobertura: coberturas.get(`${plantao.id}:${u.posicao}`) ?? null,
    }))
    .sort((a, b) => a.posicao - b.posicao)

  return { ...plantao, usuarios }
}
