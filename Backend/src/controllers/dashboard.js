const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Posição 1 vale 7 pontos, posição 7 vale 1 — mesma regra do BM Financeiro
const PONTOS_MAXIMOS = 8
const FUSO_HOSPITAL = 'America/Sao_Paulo'
const DIAS_AGENDA = 7

// "eu" filtra os plantões em que o usuário está; plantao_usuarios traz a equipe completa
const SELECT_MEUS_PLANTOES =
  'id, titulo, data, hora_inicio, hora_fim, tipo, ' +
  'eu:plantao_usuarios!inner(usuario_id, is_coordenador, posicao), ' +
  'plantao_usuarios(usuario_id, is_coordenador, posicao)'

// Tudo que o dashboard precisa numa chamada só, com as consultas em paralelo.
// Mostra apenas dados do próprio usuário — inclusive horas/pontos para plantonistas.
exports.resumo = async (req, res) => {
  const eu = req.user.id
  const agora = agoraNoHospital()
  const hoje = agora.data
  const ontem = deslocarData(hoje, -1)
  const ultimoDiaAgenda = deslocarData(hoje, DIAS_AGENDA - 1)
  const { inicio: inicioMes, fim: fimMes } = limitesDoMes(hoje)

  const [janela, proximos, trocasParaMim, trocasSolicitadas] = await Promise.all([
    // Mês corrente + agenda dos próximos dias (+ ontem, para plantões que viraram a noite)
    supabase
      .from('plantoes')
      .select(SELECT_MEUS_PLANTOES)
      .eq('eu.usuario_id', eu)
      .gte('data', ontem < inicioMes ? ontem : inicioMes)
      .lte('data', ultimoDiaAgenda > fimMes ? ultimoDiaAgenda : fimMes)
      .order('data', { ascending: true })
      .order('hora_inicio', { ascending: true }),
    // Próximo plantão pode estar além da agenda
    supabase
      .from('plantoes')
      .select(SELECT_MEUS_PLANTOES)
      .eq('eu.usuario_id', eu)
      .gte('data', ontem)
      .order('data', { ascending: true })
      .order('hora_inicio', { ascending: true })
      .limit(10),
    supabase
      .from('plantao_trocas')
      .select('*, plantoes(id, titulo, data, hora_inicio, hora_fim, tipo)')
      .eq('usuario_entrada', eu)
      .eq('status', 'pendente')
      .order('solicitado_em', { ascending: false }),
    // As que eu mesmo vou aceitar já aparecem em trocasParaMim
    supabase
      .from('plantao_trocas')
      .select('*, plantoes(id, titulo, data, hora_inicio, hora_fim, tipo)')
      .eq('solicitado_por', eu)
      .neq('usuario_entrada', eu)
      .eq('status', 'pendente')
      .order('solicitado_em', { ascending: false }),
  ])

  const erro = [janela, proximos, trocasParaMim, trocasSolicitadas].find(r => r.error)
  if (erro) return res.status(500).json({ error: erro.error.message })

  const agoraMin = paraMinutosAbsolutos(agora.data, agora.hora)
  const naoTerminou = p => calcularJanela(p.data, p.hora_inicio, p.hora_fim).fim > agoraMin

  const proximoPlantao = proximos.data.find(naoTerminou) ?? null
  const agenda = janela.data.filter(p => naoTerminou(p) && p.data <= ultimoDiaAgenda)
  const doMes = janela.data.filter(p => p.data >= inicioMes && p.data <= fimMes)

  const meuMes = {
    mes: hoje.slice(0, 7),
    plantonista: { plantoes: 0, minutos: 0 },
    socio: { plantoes: 0, pontos: 0 },
  }
  for (const p of doMes) {
    if (p.tipo === 'plantonista') {
      const { inicio, fim } = calcularJanela(p.data, p.hora_inicio, p.hora_fim)
      meuMes.plantonista.plantoes += 1
      meuMes.plantonista.minutos += fim - inicio
    } else {
      const posicao = p.eu[0]?.posicao
      meuMes.socio.plantoes += 1
      meuMes.socio.pontos += posicao != null ? PONTOS_MAXIMOS - posicao : 0
    }
  }

  try {
    const perfis = await buscarPerfis([
      ...[proximoPlantao, ...agenda].filter(Boolean).flatMap(p => p.plantao_usuarios.map(u => u.usuario_id)),
      ...trocasParaMim.data.flatMap(t => [t.usuario_saida, t.solicitado_por]),
      ...trocasSolicitadas.data.flatMap(t => [t.usuario_saida, t.usuario_entrada]),
    ])

    return res.json({
      agora,
      proximoPlantao: proximoPlantao && formatPlantao(proximoPlantao, perfis, agoraMin),
      agenda: agenda.map(p => formatPlantao(p, perfis, agoraMin)),
      trocasParaMim: trocasParaMim.data.map(t => formatTroca(t, perfis)),
      trocasSolicitadas: trocasSolicitadas.data.map(t => formatTroca(t, perfis)),
      meuMes,
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

const TAMANHO_FILA_SOCIO = 7
const TOP_N = 5

// Visão da gestão (admin/técnico): hospital como um todo, não só o usuário logado.
// Uma consulta de plantões cobre mês anterior + mês atual + agenda, e o resto sai em memória.
exports.gestao = async (req, res) => {
  const agora = agoraNoHospital()
  const hoje = agora.data
  const ultimoDiaAgenda = deslocarData(hoje, DIAS_AGENDA - 1)
  const mesAtual = limitesDoMes(hoje)
  const mesAnterior = limitesDoMes(deslocarData(mesAtual.inicio, -1))

  const [plantoes, trocas, auth] = await Promise.all([
    supabase
      .from('plantoes')
      .select('id, titulo, data, hora_inicio, hora_fim, tipo, plantao_usuarios(usuario_id, is_coordenador, posicao)')
      .gte('data', mesAnterior.inicio)
      .lte('data', ultimoDiaAgenda > mesAtual.fim ? ultimoDiaAgenda : mesAtual.fim)
      .order('data', { ascending: true })
      .order('hora_inicio', { ascending: true }),
    supabase
      .from('plantao_trocas')
      .select('*, plantoes(id, titulo, data, hora_inicio, hora_fim, tipo)')
      .eq('status', 'pendente')
      .order('solicitado_em', { ascending: true }),
    supabase.auth.admin.listUsers({ perPage: 1000 }),
  ])

  const erro = [plantoes, trocas, auth].find(r => r.error)
  if (erro) return res.status(500).json({ error: erro.error.message })

  const agoraMin = paraMinutosAbsolutos(agora.data, agora.hora)
  const janelaDe = p => calcularJanela(p.data, p.hora_inicio, p.hora_fim)

  // 6. Agora no hospital
  const emAndamento = plantoes.data.filter(p => {
    const { inicio, fim } = janelaDe(p)
    return inicio <= agoraMin && agoraMin < fim
  })

  // 7. Alertas de cobertura — plantões ainda não terminados nos próximos 7 dias
  const alertas = plantoes.data
    .filter(p => p.data <= ultimoDiaAgenda && janelaDe(p).fim > agoraMin)
    .map(p => ({ plantao: p, problema: problemaDeCobertura(p) }))
    .filter(a => a.problema)

  // 9 e 10. Resumo e ranking do mês
  const resumoAtual = resumirMes(plantoes.data, mesAtual)
  const resumoAnterior = resumirMes(plantoes.data, mesAnterior)

  // 11. Equipe cadastrada
  const porRole = {}
  let ativos = 0
  let desativados = 0
  for (const u of auth.data.users) {
    if (u.banned_until && new Date(u.banned_until) > new Date()) {
      desativados += 1
      continue
    }
    ativos += 1
    for (const role of u.app_metadata?.roles ?? []) porRole[role] = (porRole[role] ?? 0) + 1
  }

  try {
    const perfis = await buscarPerfis([
      ...[...emAndamento, ...alertas.map(a => a.plantao)].flatMap(p => p.plantao_usuarios.map(u => u.usuario_id)),
      ...resumoAtual.topHoras.map(l => l.id),
      ...resumoAtual.topPontos.map(l => l.id),
      ...trocas.data.slice(0, 1).flatMap(t => [t.usuario_saida, t.usuario_entrada, t.solicitado_por]),
    ])
    const comPerfil = linha => ({ ...(perfis.get(linha.id) ?? { id: linha.id }), ...linha })
    const formatarGeral = p => {
      const { plantao_usuarios, ...plantao } = p
      return {
        ...plantao,
        usuarios: plantao_usuarios
          .map(u => ({ ...(perfis.get(u.usuario_id) ?? { id: u.usuario_id }), coordenador: u.is_coordenador ?? false, posicao: u.posicao ?? null }))
          .sort((a, b) => (a.posicao ?? 0) - (b.posicao ?? 0)),
      }
    }

    return res.json({
      agora,
      emAndamento: emAndamento.map(formatarGeral),
      alertas: alertas.map(a => ({ problema: a.problema, plantao: formatarGeral(a.plantao) })),
      trocasPendentes: {
        total: trocas.data.length,
        maisAntiga: trocas.data[0] ? formatTroca(trocas.data[0], perfis) : null,
      },
      mes: {
        atual: { mes: mesAtual.inicio.slice(0, 7), ...resumoAtual.totais },
        anterior: { mes: mesAnterior.inicio.slice(0, 7), ...resumoAnterior.totais },
        topHoras: resumoAtual.topHoras.map(comPerfil),
        topPontos: resumoAtual.topPontos.map(comPerfil),
      },
      equipe: { ativos, desativados, porRole },
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

function problemaDeCobertura(p) {
  const n = p.plantao_usuarios.length
  if (n === 0) return 'Sem nenhum médico'
  if (p.tipo === 'socio' && n < TAMANHO_FILA_SOCIO) return `Fila incompleta (${n}/${TAMANHO_FILA_SOCIO})`
  if (p.tipo === 'plantonista' && !p.plantao_usuarios.some(u => u.is_coordenador)) return 'Sem coordenador'
  return null
}

// Mesmas regras do BM Financeiro: horas somadas por médico, pontos = 8 − posição
function resumirMes(plantoes, { inicio, fim }) {
  const horas = new Map()
  const pontos = new Map()
  const totais = { plantoes: 0, minutos: 0, pontos: 0 }

  for (const p of plantoes) {
    if (p.data < inicio || p.data > fim) continue
    totais.plantoes += 1
    if (p.tipo === 'plantonista') {
      const { inicio: ini, fim: f } = calcularJanela(p.data, p.hora_inicio, p.hora_fim)
      for (const u of p.plantao_usuarios) {
        horas.set(u.usuario_id, (horas.get(u.usuario_id) ?? 0) + (f - ini))
        totais.minutos += f - ini
      }
    } else {
      for (const u of p.plantao_usuarios) {
        const pts = u.posicao != null ? PONTOS_MAXIMOS - u.posicao : 0
        pontos.set(u.usuario_id, (pontos.get(u.usuario_id) ?? 0) + pts)
        totais.pontos += pts
      }
    }
  }

  const top = (mapa, campo) =>
    [...mapa.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_N)
      .map(([id, valor]) => ({ id, [campo]: valor }))

  return { totais, topHoras: top(horas, 'minutos'), topPontos: top(pontos, 'pontos') }
}

// Render roda em UTC; os plantões são cadastrados no horário do hospital
function agoraNoHospital() {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: FUSO_HOSPITAL,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    })
      .formatToParts(new Date())
      .map(p => [p.type, p.value])
  )
  return { data: `${partes.year}-${partes.month}-${partes.day}`, hora: `${partes.hour}:${partes.minute}` }
}

function limitesDoMes(data) {
  const [ano, mes] = data.split('-').map(Number)
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate()
  const prefixo = data.slice(0, 7)
  return { inicio: `${prefixo}-01`, fim: `${prefixo}-${String(ultimoDia).padStart(2, '0')}` }
}

function formatPlantao(row, perfis, agoraMin) {
  const { eu, plantao_usuarios, ...plantao } = row
  const { inicio } = calcularJanela(plantao.data, plantao.hora_inicio, plantao.hora_fim)
  return {
    ...plantao,
    emAndamento: inicio <= agoraMin,
    meuPapel: { coordenador: eu[0]?.is_coordenador ?? false, posicao: eu[0]?.posicao ?? null },
    usuarios: plantao_usuarios
      .map(u => ({
        ...(perfis.get(u.usuario_id) ?? { id: u.usuario_id }),
        coordenador: u.is_coordenador ?? false,
        posicao: u.posicao ?? null,
      }))
      .sort((a, b) => (a.posicao ?? 0) - (b.posicao ?? 0)),
  }
}

function formatTroca(row, perfis) {
  return {
    id: row.id,
    solicitadoEm: row.solicitado_em,
    plantao: row.plantoes,
    usuarioSaida: perfis.get(row.usuario_saida) ?? { id: row.usuario_saida },
    usuarioEntrada: perfis.get(row.usuario_entrada) ?? { id: row.usuario_entrada },
    solicitadoPor: perfis.get(row.solicitado_por) ?? { id: row.solicitado_por },
  }
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
