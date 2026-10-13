const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const { ROTULO_TIPO, buscarAfastamentosNoPeriodo, afastamentoEm, usuariosAfastados } = require('../services/afastamentos')

const { ehGestao } = require('../middleware/auth')
const { ehNoturno, posicoesDoPlantao, rotuloPosicao, ordemDaPosicao } = require('../services/posicoes')
const {
  duracaoDaCobertura, dataDaCobertura, validarIntervalo, buscarCoberturas,
} = require('../services/coberturas')
const { respondenteDaTroca } = require('../services/trocas')

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

  const rolesCriador = req.user.app_metadata?.roles ?? []
  if (tipo === 'socio' && rolesCriador.includes('anestesita_plantonista') && !rolesCriador.includes('anestesita_socio')) {
    return res.status(403).json({ error: 'Médicos plantonistas não podem criar plantões de sócio' })
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

    if (membrosError) {
      // Sem os membros o plantão ficaria vazio no calendário: desfaz a criação
      await supabase.from('plantoes').delete().eq('id', plantao.id)
      return res.status(400).json({ error: membrosError.message })
    }
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
    .select('*, plantao_usuarios(usuario_id, is_coordenador, posicao)')
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

  // Mudou dia ou horário: a equipe atual precisa estar livre e sem afastamento na nova janela
  if (data !== undefined || hora_inicio !== undefined || hora_fim !== undefined) {
    const { data: atual, error: atualError } = await supabase
      .from('plantoes')
      .select('id, tipo, data, hora_inicio, hora_fim, plantao_usuarios(usuario_id, posicao)')
      .eq('id', req.params.id)
      .maybeSingle()

    if (atualError) return res.status(500).json({ error: atualError.message })
    if (!atual) return res.status(404).json({ error: 'Plantão não encontrado' })

    const ids = atual.plantao_usuarios.map(u => u.usuario_id)
    const novaData = data ?? atual.data

    // O intervalo de uma troca por horas é relativo ao horário do plantão
    if ((await buscarCoberturas([atual.id])).length > 0) {
      return res.status(400).json({ error: 'Esse plantão tem troca por horas valendo. Cancele-a antes de mudar o dia ou o horário.' })
    }

    // Passar de diurno para noturno (ou o contrário) muda as vagas da fila: quem está numa vaga
    // que não existe no novo tipo precisa sair antes
    if (atual.tipo === 'socio' && hora_inicio !== undefined) {
      const permitidas = posicoesDoPlantao(hora_inicio)
      const foraDaFila = atual.plantao_usuarios.filter(u => u.posicao != null && !permitidas.includes(u.posicao))
      if (foraDaFila.length > 0) {
        const vagas = [...new Set(foraDaFila.map(u => rotuloPosicao(u.posicao)))].join(', ')
        const novoTipo = ehNoturno(hora_inicio) ? 'noturno' : 'diurno'
        return res.status(400).json({
          error: `Com esse horário o plantão vira ${novoTipo}, e as vagas ${vagas} deixam de existir. Remova quem está nelas antes de mudar o horário.`
        })
      }
    }

    try {
      const ocupados = await usuariosComConflito(
        ids, novaData, hora_inicio ?? atual.hora_inicio, hora_fim ?? atual.hora_fim, atual.id
      )
      if (ocupados.size > 0) {
        const perfis = await buscarPerfis([...ocupados])
        const nomes = [...ocupados].map(id => perfis.get(id)?.nome ?? perfis.get(id)?.email ?? id)
        return res.status(400).json({ error: `Médico(s) já escalado(s) em outro plantão nesse horário: ${nomes.join(', ')}` })
      }
      await validarSemAfastamento(ids, novaData)
    } catch (err) {
      return res.status(400).json({ error: err.message })
    }
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
    const coberturas = await buscarCoberturasPorSlot([plantao.id])
    return res.json(formatPlantao(plantao, perfis, trocasPendentes, await buscarAfastamentosDosPlantoes([plantao]), coberturas))
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

  // A troca pendente do slot (e a troca por horas valendo) perde o sentido, mas continua no histórico como cancelada
  const { error: trocaError } = await supabase
    .from('plantao_trocas')
    .update({ status: 'cancelada', respondido_em: new Date().toISOString() })
    .eq('plantao_id', req.params.id)
    .eq('usuario_saida', req.params.usuarioId)
    .or('status.eq.pendente,and(status.eq.aceita,hora_inicio.not.is.null)')

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

// Move um sócio para outra posição da fila. Se a posição estiver ocupada, os dois trocam de lugar.
// Vale na hora (sem aceite) e fica registrado em plantao_mudancas_posicao.
exports.alterarPosicao = async (req, res) => {
  const { usuario_id, posicao } = req.body

  if (!usuario_id || !Number.isInteger(posicao)) {
    return res.status(400).json({ error: 'usuario_id e posicao (número inteiro) são obrigatórios' })
  }

  const { data: plantao, error: plantaoError } = await supabase
    .from('plantoes')
    .select('id, tipo, hora_inicio, plantao_usuarios(usuario_id, posicao)')
    .eq('id', req.params.id)
    .maybeSingle()

  if (plantaoError) return res.status(500).json({ error: plantaoError.message })
  if (!plantao) return res.status(404).json({ error: 'Plantão não encontrado' })
  if (plantao.tipo !== 'socio') {
    return res.status(400).json({ error: 'Somente plantões de sócio têm posições' })
  }
  if (!posicoesDoPlantao(plantao.hora_inicio).includes(posicao)) {
    return res.status(400).json({ error: 'Essa posição não existe na fila desse plantão' })
  }

  // Sócio fora da gestão só reordena a fila dos plantões em que está escalado
  if (!ehGestao(req.user) && !plantao.plantao_usuarios.some(u => u.usuario_id === req.user.id)) {
    return res.status(403).json({ error: 'Você só pode mudar posições nos plantões em que está escalado' })
  }

  const membro = plantao.plantao_usuarios.find(u => u.usuario_id === usuario_id)
  if (!membro) return res.status(404).json({ error: 'Médico não está neste plantão' })
  if (membro.posicao === posicao) return res.json({ message: 'Posição mantida' })

  const ocupante = plantao.plantao_usuarios.find(u => u.posicao === posicao)

  const moverPara = (id, novaPosicao) => supabase
    .from('plantao_usuarios')
    .update({ posicao: novaPosicao })
    .eq('plantao_id', plantao.id)
    .eq('usuario_id', id)

  if (ocupante) {
    // A posição é única por plantão: libera a do médico antes de mover o ocupante para ela
    const passos = [
      () => moverPara(usuario_id, null),
      () => moverPara(ocupante.usuario_id, membro.posicao),
      () => moverPara(usuario_id, posicao),
    ]
    for (const [i, passo] of passos.entries()) {
      const { error } = await passo()
      if (error) {
        // Desfaz o que já foi feito para não deixar a fila pela metade
        if (i >= 2) await moverPara(ocupante.usuario_id, posicao)
        if (i >= 1) await moverPara(usuario_id, membro.posicao)
        return res.status(400).json({ error: error.message })
      }
    }
  } else {
    const { error } = await moverPara(usuario_id, posicao)
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Posição já ocupada nesse plantão' })
      return res.status(400).json({ error: error.message })
    }
  }

  const { error: logError } = await supabase
    .from('plantao_mudancas_posicao')
    .insert({
      plantao_id: plantao.id,
      usuario_id,
      posicao_anterior: membro.posicao,
      posicao_nova: posicao,
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

  const { data: atual, error: atualError } = await supabase
    .from('plantao_usuarios')
    .select('usuario_id')
    .eq('plantao_id', req.params.id)
    .eq('is_coordenador', true)
    .maybeSingle()

  if (atualError) return res.status(500).json({ error: atualError.message })
  if (atual && atual.usuario_id !== usuario_id && (await usuariosSoSocio([atual.usuario_id])).length > 0) {
    return res.status(400).json({
      error: 'O coordenador atual é sócio e não pode continuar na equipe como membro. Use "Trocar" para substituí-lo.'
    })
  }

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

  if (definirError) {
    // Devolve o coordenador anterior para o plantão não ficar sem nenhum
    if (atual) {
      await supabase
        .from('plantao_usuarios')
        .update({ is_coordenador: true })
        .eq('plantao_id', req.params.id)
        .eq('usuario_id', atual.usuario_id)
    }
    // Índice único: outra pessoa definiu um coordenador ao mesmo tempo
    if (definirError.code === '23505') {
      return res.status(409).json({ error: 'O coordenador acabou de ser alterado por outra pessoa. Recarregue o plantão.' })
    }
    return res.status(400).json({ error: definirError.message })
  }

  return res.json({ message: 'Coordenador definido' })
}

// Sem hora_inicio/hora_fim troca a vaga inteira; com eles é a troca por horas (o convidado cobre só o intervalo)
exports.criarTroca = async (req, res) => {
  const { usuario_saida, usuario_entrada, hora_inicio = null, hora_fim = null } = req.body
  const parcial = hora_inicio != null || hora_fim != null

  if (!usuario_saida || !usuario_entrada) {
    return res.status(400).json({ error: 'usuario_saida e usuario_entrada são obrigatórios' })
  }
  if (usuario_saida === usuario_entrada) {
    return res.status(400).json({ error: 'usuario_saida e usuario_entrada devem ser diferentes' })
  }
  // Médico fora da gestão pede a troca da própria vaga ou a vaga de alguém para si
  if (!ehGestao(req.user) && req.user.id !== usuario_saida && req.user.id !== usuario_entrada) {
    return res.status(403).json({ error: 'Você só pode pedir a troca da sua vaga ou pedir a vaga de alguém para você' })
  }

  const { data: plantao, error: plantaoError } = await supabase
    .from('plantoes')
    .select('id, tipo, data, hora_inicio, hora_fim')
    .eq('id', req.params.id)
    .maybeSingle()

  if (plantaoError) return res.status(500).json({ error: plantaoError.message })
  if (!plantao) return res.status(404).json({ error: 'Plantão não encontrado' })

  if (parcial) {
    const erroIntervalo = validarIntervalo(plantao, hora_inicio, hora_fim)
    if (erroIntervalo) return res.status(400).json({ error: erroIntervalo })
  }

  const { data: slotSaida, error: slotError } = await supabase
    .from('plantao_usuarios')
    .select('usuario_id, is_coordenador')
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

  if (plantao.tipo === 'plantonista' && !slotSaida.is_coordenador && (await usuariosSoSocio([usuario_entrada])).length > 0) {
    return res.status(400).json({ error: 'Sócios só podem entrar em plantão de plantonista como coordenador' })
  }

  // Uma vaga tem no máximo uma troca por horas valendo; com ela ativa, nem a troca inteira é aceita
  const coberturaAtiva = (await buscarCoberturas([plantao.id])).find(c => c.usuario_saida === usuario_saida)
  if (coberturaAtiva) {
    return res.status(400).json({ error: 'Essa vaga já tem uma troca por horas valendo. A gestão precisa cancelá-la antes.' })
  }

  // Na troca por horas, o convidado só precisa estar livre no intervalo que vai cobrir
  const janelaEntrada = parcial
    ? { data: dataDaCobertura(plantao, hora_inicio), horaInicio: hora_inicio, horaFim: hora_fim }
    : { data: plantao.data, horaInicio: plantao.hora_inicio, horaFim: plantao.hora_fim }
  const ocupados = await usuariosComConflito(
    [usuario_entrada], janelaEntrada.data, janelaEntrada.horaInicio, janelaEntrada.horaFim, plantao.id
  )
  if (ocupados.size > 0) {
    return res.status(400).json({ error: 'usuario_entrada já está escalado em outro plantão nesse horário' })
  }

  try {
    await validarSemAfastamento([usuario_entrada], plantao.data)
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }

  const { data: troca, error } = await supabase
    .from('plantao_trocas')
    .insert({
      plantao_id: req.params.id,
      usuario_saida,
      usuario_entrada,
      solicitado_por: req.user.id,
      hora_inicio: parcial ? hora_inicio : null,
      hora_fim: parcial ? hora_fim : null,
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

// Gestão desfaz uma troca por horas já aceita: a vaga volta inteira para o titular
exports.cancelarCobertura = async (req, res) => {
  const { data, error } = await supabase
    .from('plantao_trocas')
    .update({ status: 'cancelada', respondido_em: new Date().toISOString() })
    .eq('id', req.params.trocaId)
    .eq('plantao_id', req.params.id)
    .eq('status', 'aceita')
    .not('hora_inicio', 'is', null)
    .select('id')

  if (error) return res.status(400).json({ error: error.message })
  if (!data || data.length === 0) return res.status(404).json({ error: 'Troca por horas não encontrada' })

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
    .select('*, plantoes(id, titulo, data, hora_inicio, hora_fim)')
    .or(`usuario_entrada.eq.${req.user.id},usuario_saida.eq.${req.user.id}`)
    .eq('status', 'pendente')
    .order('solicitado_em', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })

  const data = envolvido.filter(t => respondenteDaTroca(t) === req.user.id)

  try {
    const ids = data.flatMap(t => [t.usuario_saida, t.usuario_entrada, t.solicitado_por])
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
  if (respondenteDaTroca(troca) !== req.user.id) {
    return res.status(403).json({ error: 'Essa solicitação não está esperando a sua resposta' })
  }
  // Quem responde pode ser quem entra ou, quando ele mesmo pediu a vaga, o titular
  const quemEntra = troca.usuario_entrada === req.user.id ? 'Você' : 'O médico que entra'
  if (troca.status !== 'pendente') {
    return res.status(400).json({ error: 'Essa solicitação já foi respondida' })
  }

  if (aceitar) {
    const { data: slot, error: slotError } = await supabase
      .from('plantao_usuarios')
      .select('is_coordenador, plantoes(id, tipo, data, hora_inicio, hora_fim)')
      .eq('plantao_id', troca.plantao_id)
      .eq('usuario_id', troca.usuario_saida)
      .maybeSingle()

    if (slotError) return res.status(500).json({ error: slotError.message })
    if (slot?.plantoes?.tipo === 'plantonista' && !slot.is_coordenador && (await usuariosSoSocio([troca.usuario_entrada])).length > 0) {
      return res.status(409).json({ error: 'Sócios só podem entrar em plantão de plantonista como coordenador' })
    }

    if (slot?.plantoes?.data && (await usuariosAfastados([troca.usuario_entrada], slot.plantoes.data)).size > 0) {
      return res.status(409).json({ error: `${quemEntra} está de férias ou em congresso no dia desse plantão` })
    }

    // A troca pode ter ficado dias pendente: confere de novo se o convidado continua livre nesse horário
    // (na troca por horas, só no intervalo que ele vai cobrir)
    if (slot?.plantoes) {
      const p = slot.plantoes
      const janela = troca.hora_inicio
        ? [dataDaCobertura(p, troca.hora_inicio), troca.hora_inicio, troca.hora_fim]
        : [p.data, p.hora_inicio, p.hora_fim]
      const ocupados = await usuariosComConflito([troca.usuario_entrada], ...janela, troca.plantao_id)
      if (ocupados.size > 0) {
        return res.status(409).json({ error: `${quemEntra} já está escalado em outro plantão nesse horário` })
      }
    }

    if (troca.hora_inicio) {
      if (!slot) return res.status(409).json({ error: 'O médico que está saindo não está mais nesse plantão' })
      const outra = (await buscarCoberturas([troca.plantao_id])).find(c => c.usuario_saida === troca.usuario_saida)
      if (outra) return res.status(409).json({ error: 'Essa vaga já tem outra troca por horas valendo' })
    }
  }

  // Reserva a troca antes de mexer na equipe: só uma resposta passa, mesmo com dois cliques ao mesmo tempo
  const { data: atualizada, error } = await supabase
    .from('plantao_trocas')
    .update({ status: aceitar ? 'aceita' : 'recusada', respondido_em: new Date().toISOString() })
    .eq('id', req.params.trocaId)
    .eq('status', 'pendente')
    .select()
    .maybeSingle()

  if (error) return res.status(400).json({ error: error.message })
  if (!atualizada) return res.status(400).json({ error: 'Essa solicitação já foi respondida' })

  // Troca por horas não mexe na equipe: a vaga continua do titular e a troca aceita é a cobertura
  if (aceitar && !troca.hora_inicio) {
    const { data: linhasAtualizadas, error: swapError } = await supabase
      .from('plantao_usuarios')
      .update({ usuario_id: troca.usuario_entrada })
      .eq('plantao_id', troca.plantao_id)
      .eq('usuario_id', troca.usuario_saida)
      .select()

    if (swapError || !linhasAtualizadas || linhasAtualizadas.length === 0) {
      // A equipe não mudou: a troca volta a ficar pendente
      await supabase
        .from('plantao_trocas')
        .update({ status: 'pendente', respondido_em: null })
        .eq('id', req.params.trocaId)

      if (swapError?.code === '23505') return res.status(409).json({ error: `${quemEntra} já está nesse plantão` })
      if (swapError) return res.status(400).json({ error: swapError.message })
      return res.status(409).json({ error: 'O médico que está saindo não está mais nesse plantão' })
    }
  }

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

  const socios = await usuariosSoSocio(usuarios.filter(id => id !== coordenadorId))
  if (socios.length > 0) {
    throw new Error('Sócios só podem entrar em plantão de plantonista como coordenador')
  }

  if (janela) {
    const ocupados = await usuariosComConflito(usuarios, janela.data, janela.horaInicio, janela.horaFim, janela.excluirPlantaoId)
    if (ocupados.size > 0) {
      throw new Error(`Médico(s) já escalado(s) em outro plantão nesse horário: ${[...ocupados].join(', ')}`)
    }
    await validarSemAfastamento(usuarios, janela.data)
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

  // Diurno: 1 a 7 e 8 = intermediário. Noturno (19h em diante): 1, 9 (segundo 1º), 2, 3 e 4
  const permitidas = posicoesDoPlantao(janela.horaInicio)
  const posicaoInvalida = fila.some(
    f => !f?.usuario_id || !Number.isInteger(f.posicao) || !permitidas.includes(f.posicao)
  )
  if (posicaoInvalida) {
    throw new Error(
      ehNoturno(janela.horaInicio)
        ? 'cada item da fila precisa de usuario_id e posicao (plantão noturno: 1, 9 = segundo 1º, 2, 3 ou 4)'
        : 'cada item da fila precisa de usuario_id e posicao (número inteiro entre 1 e 8; 8 = intermediário)'
    )
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
    await validarSemAfastamento(usuarioIds, janela.data)
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

// Quem é só sócio (sem a role de plantonista) — em plantão de plantonista, só entra como coordenador
async function usuariosSoSocio(usuarioIds) {
  const idsUnicos = [...new Set(usuarioIds)]

  const resultados = await Promise.all(
    idsUnicos.map(async id => {
      const { data } = await supabase.auth.admin.getUserById(id)
      const roles = data?.user?.app_metadata?.roles ?? []
      return { id, soSocio: roles.includes('anestesita_socio') && !roles.includes('anestesita_plantonista') }
    })
  )

  return resultados.filter(r => r.soSocio).map(r => r.id)
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

  const outros = plantoesProximos.filter(p => p.id !== excluirPlantaoId)
  const plantoesConflitantes = outros.filter(p => seSobrepoe(alvo, calcularJanela(p.data, p.hora_inicio, p.hora_fim)))
  if (plantoesConflitantes.length === 0) return new Set()

  const { data: membros, error: membrosError } = await supabase
    .from('plantao_usuarios')
    .select('usuario_id')
    .in('plantao_id', plantoesConflitantes.map(p => p.id))
    .in('usuario_id', idsUnicos)

  if (membrosError) throw membrosError

  const ocupados = new Set(membros.map(m => m.usuario_id))

  // Quem cobre parte de outro plantão (troca por horas) está ocupado só no intervalo coberto
  const porId = new Map(plantoesConflitantes.map(p => [p.id, p]))
  const coberturas = await buscarCoberturas([...porId.keys()])
  for (const c of coberturas) {
    if (!idsUnicos.includes(c.usuario_entrada)) continue
    const inicio = paraMinutosAbsolutos(dataDaCobertura(porId.get(c.plantao_id), c.hora_inicio), c.hora_inicio)
    const janela = { inicio, fim: inicio + duracaoDaCobertura(c.hora_inicio, c.hora_fim) }
    if (seSobrepoe(alvo, janela)) ocupados.add(c.usuario_entrada)
  }

  return ocupados
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
    `${t.plantao_id}:${t.usuario_saida}`,
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

// Troca por horas valendo de cada vaga, pela chave "plantao:titular"
async function buscarCoberturasPorSlot(plantaoIds) {
  const coberturas = await buscarCoberturas(plantaoIds)
  if (coberturas.length === 0) return new Map()
  const perfis = await buscarPerfis(coberturas.map(c => c.usuario_entrada))
  return new Map(coberturas.map(c => [
    `${c.plantao_id}:${c.usuario_saida}`,
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

function formatPlantao(row, perfis, trocasPendentes = new Map(), afastamentos = [], coberturas = new Map()) {
  const { plantao_usuarios, ...plantao } = row
  const usuarios = plantao_usuarios
    .map(u => ({
      ...(perfis.get(u.usuario_id) ?? { id: u.usuario_id }),
      coordenador: u.is_coordenador ?? false,
      posicao: u.posicao ?? null,
      trocaPendente: trocasPendentes.get(`${plantao.id}:${u.usuario_id}`) ?? null,
      afastamento: afastamentoEm(afastamentos, u.usuario_id, plantao.data),
      cobertura: coberturas.get(`${plantao.id}:${u.usuario_id}`) ?? null,
    }))
    // Sócio: pela posição na fila. Plantonista (sem posição): coordenador primeiro e depois pelo nome,
    // para o "Membro N" não mudar de lugar entre uma carga e outra
    .sort((a, b) =>
      ordemDaPosicao(a.posicao) - ordemDaPosicao(b.posicao) ||
      Number(b.coordenador) - Number(a.coordenador) ||
      (a.nome ?? '').localeCompare(b.nome ?? '', 'pt-BR') ||
      a.id.localeCompare(b.id)
    )

  return { ...plantao, usuarios }
}
