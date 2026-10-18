const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const {
  TURNOS, pontosDaPosicao, ehVagaDeCoordenador, turnoDaPosicao, horarioDaVaga,
} = require('../services/posicoes')
const { buscarCoberturas, repartirPlantao, duracaoDaVaga, duracaoDaCobertura } = require('../services/coberturas')
const { respondenteDaTroca, trocaVencida } = require('../services/trocas')
const { contaComoSocio } = require('../services/usuarios')

const FUSO_HOSPITAL = 'America/Sao_Paulo'
const DIAS_AGENDA = 7

// "eu" filtra os plantões em que o usuário está; plantao_usuarios traz todas as vagas
const SELECT_MEUS_PLANTOES =
  'id, titulo, data, ' +
  'eu:plantao_usuarios!inner(usuario_id, posicao), ' +
  'plantao_usuarios(usuario_id, posicao)'
const SELECT_TROCA = '*, plantoes(id, titulo, data)'

// Um turno do plantão como uma linha da agenda: o horário do turno e só as vagas dele
function doTurno(plantao, turno) {
  return {
    ...plantao,
    turno,
    ...TURNOS[turno],
    plantao_usuarios: plantao.plantao_usuarios.filter(u => turnoDaPosicao(u.posicao) === turno),
  }
}

// Cada vaga minha vira uma linha (quem faz o diurno e o noturno do mesmo dia tem duas), com "eu" = essa vaga
function minhasVagas(plantoes) {
  return plantoes.flatMap(({ eu, ...plantao }) =>
    eu.map(vaga => ({ ...doTurno(plantao, turnoDaPosicao(vaga.posicao)), eu: [vaga] }))
  )
}

// Tudo que o dashboard precisa numa chamada só, com as consultas em paralelo.
// Mostra apenas dados do próprio usuário — inclusive horas/pontos para plantonistas.
exports.resumo = async (req, res) => {
  const eu = req.user.id
  const agora = agoraNoHospital()
  const hoje = agora.data
  const ontem = deslocarData(hoje, -1)
  const ultimoDiaAgenda = deslocarData(hoje, DIAS_AGENDA - 1)
  const { inicio: inicioMes, fim: fimMes } = limitesDoMes(hoje)

  const inicioJanela = ontem < inicioMes ? ontem : inicioMes

  const [janela, proximos, trocasParaMim, trocasSolicitadas, minhasCoberturas] = await Promise.all([
    // Mês corrente + agenda dos próximos dias (+ ontem, para plantões que viraram a noite)
    supabase
      .from('plantoes')
      .select(SELECT_MEUS_PLANTOES)
      .eq('eu.usuario_id', eu)
      .gte('data', inicioJanela)
      .lte('data', ultimoDiaAgenda > fimMes ? ultimoDiaAgenda : fimMes)
      .order('data', { ascending: true }),
    // Próximo plantão pode estar além da agenda
    supabase
      .from('plantoes')
      .select(SELECT_MEUS_PLANTOES)
      .eq('eu.usuario_id', eu)
      .gte('data', ontem)
      .order('data', { ascending: true })
      .limit(10),
    // Em que eu entro ou saio; abaixo ficam só as que esperam a minha resposta
    supabase
      .from('plantao_trocas')
      .select(SELECT_TROCA)
      .or(`usuario_entrada.eq.${eu},usuario_saida.eq.${eu}`)
      .eq('status', 'pendente')
      .order('solicitado_em', { ascending: false }),
    // Quem pediu nunca é quem responde: todas as que eu pedi esperam outra pessoa
    supabase
      .from('plantao_trocas')
      .select(SELECT_TROCA)
      .eq('solicitado_por', eu)
      .eq('status', 'pendente')
      .order('solicitado_em', { ascending: false }),
    // Trocas por horas em que eu cubro parte da vaga de alguém
    supabase
      .from('plantao_trocas')
      .select(
        'id, posicao, usuario_saida, hora_inicio, hora_fim, ' +
        'plantoes!inner(id, titulo, data, plantao_usuarios(usuario_id, posicao))'
      )
      .eq('usuario_entrada', eu)
      .eq('status', 'aceita')
      .not('hora_inicio', 'is', null)
      .gte('plantoes.data', inicioJanela),
  ])

  const erro = [janela, proximos, trocasParaMim, trocasSolicitadas, minhasCoberturas].find(r => r.error)
  if (erro) return res.status(500).json({ error: erro.error.message })
  trocasParaMim.data = trocasParaMim.data.filter(t => respondenteDaTroca(t) === eu && !trocaVencida(t, t.plantoes?.data))
  trocasSolicitadas.data = trocasSolicitadas.data.filter(t => !trocaVencida(t, t.plantoes?.data))

  const minhas = minhasVagas(janela.data)
  const minhasProximas = minhasVagas(proximos.data)

  // Vaga que eu cubro em parte vira uma linha como as outras, com "eu" = a vaga do titular
  const comoCobertura = minhasCoberturas.data
    .map(c => {
      const slot = c.plantoes.plantao_usuarios.find(u => u.posicao === c.posicao && u.usuario_id === c.usuario_saida)
      if (!slot) return null
      return {
        ...doTurno(c.plantoes, turnoDaPosicao(c.posicao)),
        eu: [slot],
        cobertura: { titular: c.usuario_saida, hora_inicio: c.hora_inicio, hora_fim: c.hora_fim },
      }
    })
    .filter(Boolean)
  const porData = (a, b) => (a.data + a.hora_inicio).localeCompare(b.data + b.hora_inicio)

  // Partes das minhas vagas que outra pessoa cobre
  let coberturasDasMinhas
  try {
    coberturasDasMinhas = (await buscarCoberturas([...janela.data, ...proximos.data].map(p => p.id)))
      .filter(c => c.usuario_saida === eu)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
  const coberturaDaMinhaVaga = p =>
    coberturasDasMinhas.find(c => c.plantao_id === p.id && c.posicao === p.eu[0].posicao) ?? null

  const agoraMin = paraMinutosAbsolutos(agora.data, agora.hora)
  const naoTerminou = p => calcularJanela(p.data, p.hora_inicio, p.hora_fim).fim > agoraMin

  const proximoPlantao = [...minhasProximas, ...comoCobertura].sort(porData).find(naoTerminou) ?? null
  const agenda = [...minhas, ...comoCobertura].sort(porData).filter(p => naoTerminou(p) && p.data <= ultimoDiaAgenda)
  const doMes = [...minhas, ...comoCobertura].filter(p => p.data >= inicioMes && p.data <= fimMes)

  // O plantão não tem tipo: quem tem o cargo de sócio soma pontos e quem é só plantonista soma horas
  const souSocio = contaComoSocio(req.user.app_metadata?.roles)
  const meuMes = {
    mes: hoje.slice(0, 7),
    plantonista: { plantoes: 0, minutos: 0 },
    socio: { plantoes: 0, pontos: 0 },
  }
  for (const p of doMes) {
    // Fração da vaga que é minha: o intervalo que cubro, ou o que sobra quando alguém cobre parte da minha vaga
    const total = duracaoDaVaga(p)
    const outro = p.cobertura ? null : coberturaDaMinhaVaga(p)
    const minutos = p.cobertura
      ? duracaoDaCobertura(p.cobertura.hora_inicio, p.cobertura.hora_fim)
      : total - (outro ? duracaoDaCobertura(outro.hora_inicio, outro.hora_fim) : 0)
    if (souSocio) {
      meuMes.socio.plantoes += 1
      meuMes.socio.pontos += pontosDaPosicao(p.eu[0]?.posicao) * (minutos / total)
    } else {
      meuMes.plantonista.plantoes += 1
      meuMes.plantonista.minutos += minutos
    }
  }
  meuMes.socio.pontos = Math.round(meuMes.socio.pontos * 100) / 100

  try {
    const perfis = await buscarPerfis([
      ...[proximoPlantao, ...agenda].filter(Boolean).flatMap(p => p.plantao_usuarios.map(u => u.usuario_id)),
      ...trocasParaMim.data.flatMap(t => [t.usuario_saida, t.usuario_entrada, t.solicitado_por]),
      ...trocasSolicitadas.data.flatMap(t => [t.usuario_saida, t.usuario_entrada]),
      ...comoCobertura.map(p => p.cobertura.titular),
      ...coberturasDasMinhas.map(c => c.usuario_entrada),
    ])
    const formatar = p => formatPlantao(p, perfis, agoraMin, p.cobertura ? null : coberturaDaMinhaVaga(p))

    return res.json({
      agora,
      proximoPlantao: proximoPlantao && formatar(proximoPlantao),
      agenda: agenda.map(formatar),
      trocasParaMim: trocasParaMim.data.map(t => formatTroca(t, perfis)),
      trocasSolicitadas: trocasSolicitadas.data.map(t => formatTroca(t, perfis)),
      meuMes,
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

const TOP_N = 5

// Visão da gestão (escritório/admin/técnico): hospital como um todo, não só o usuário logado.
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
      .select('id, titulo, data, plantao_usuarios(usuario_id, posicao)')
      .gte('data', mesAnterior.inicio)
      .lte('data', ultimoDiaAgenda > mesAtual.fim ? ultimoDiaAgenda : mesAtual.fim)
      .order('data', { ascending: true }),
    supabase
      .from('plantao_trocas')
      .select(SELECT_TROCA)
      .eq('status', 'pendente')
      .order('solicitado_em', { ascending: true }),
    supabase.auth.admin.listUsers({ perPage: 1000 }),
  ])

  const erro = [plantoes, trocas, auth].find(r => r.error)
  if (erro) return res.status(500).json({ error: erro.error.message })
  trocas.data = trocas.data.filter(t => !trocaVencida(t, t.plantoes?.data))

  let coberturas
  try {
    coberturas = await buscarCoberturas(plantoes.data.map(p => p.id))
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }

  const agoraMin = paraMinutosAbsolutos(agora.data, agora.hora)
  const janelaDe = p => calcularJanela(p.data, p.hora_inicio, p.hora_fim)
  // Agora no hospital e alertas são por turno: o diurno e o noturno de cada plantão
  const turnos = plantoes.data.flatMap(p => Object.keys(TURNOS).map(turno => doTurno(p, turno)))

  // 6. Agora no hospital
  const emAndamento = turnos.filter(p => {
    const { inicio, fim } = janelaDe(p)
    return inicio <= agoraMin && agoraMin < fim
  })

  // 7. Alertas de cobertura — turnos ainda não terminados nos próximos 7 dias
  const alertas = turnos
    .filter(p => p.data <= ultimoDiaAgenda && janelaDe(p).fim > agoraMin)
    .map(p => ({ plantao: p, problema: problemaDeCobertura(p) }))
    .filter(a => a.problema)

  // 9 e 10. Resumo e ranking do mês, separando sócio e plantonista pelo cargo
  const roles = new Map(auth.data.users.map(u => [u.id, u.app_metadata?.roles ?? []]))
  const resumoAtual = resumirMes(plantoes.data, mesAtual, coberturas, roles)
  const resumoAnterior = resumirMes(plantoes.data, mesAnterior, coberturas, roles)

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
      return { ...plantao, usuarios: formatarVagas(plantao_usuarios, perfis) }
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

// p é um turno do plantão (doTurno)
function problemaDeCobertura(p) {
  if (p.plantao_usuarios.length === 0) return 'Sem nenhum médico'
  // Alerta de vagas incompletas desligado por enquanto
  if (p.turno === 'diurno' && !p.plantao_usuarios.some(u => ehVagaDeCoordenador(u.posicao))) return 'Sem coordenador'
  return null
}

// Mesmas regras do BM Financeiro: quem tem o cargo de sócio soma pontos pela vaga e quem é só plantonista
// soma horas; troca por horas rateada
function resumirMes(plantoes, { inicio, fim }, coberturas, roles) {
  const horas = new Map()
  const pontos = new Map()
  const totais = { plantoes: 0, minutos: 0, pontos: 0 }

  for (const p of plantoes) {
    if (p.data < inicio || p.data > fim) continue
    totais.plantoes += 1
    for (const parte of repartirPlantao(p, p.plantao_usuarios, coberturas)) {
      if (contaComoSocio(roles.get(parte.usuario_id))) {
        const pts = pontosDaPosicao(parte.posicao) * parte.fracao
        pontos.set(parte.usuario_id, (pontos.get(parte.usuario_id) ?? 0) + pts)
        totais.pontos += pts
      } else {
        horas.set(parte.usuario_id, (horas.get(parte.usuario_id) ?? 0) + parte.minutos)
        totais.minutos += parte.minutos
      }
    }
  }
  const duasCasas = n => Math.round(n * 100) / 100
  totais.pontos = duasCasas(totais.pontos)
  for (const [id, v] of pontos) pontos.set(id, duasCasas(v))

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

// cobertura: eu cubro parte da vaga de alguém. coberturaDaMinhaVaga: alguém cobre parte da minha.
function formatPlantao(row, perfis, agoraMin, coberturaDaMinhaVaga = null) {
  const { eu, plantao_usuarios, cobertura, ...plantao } = row
  const { inicio } = calcularJanela(plantao.data, plantao.hora_inicio, plantao.hora_fim)
  return {
    ...plantao,
    emAndamento: inicio <= agoraMin,
    meuPapel: {
      coordenador: ehVagaDeCoordenador(eu[0]?.posicao),
      posicao: eu[0]?.posicao ?? null,
      cobrindo: cobertura
        ? { titular: perfis.get(cobertura.titular) ?? { id: cobertura.titular }, horaInicio: cobertura.hora_inicio, horaFim: cobertura.hora_fim }
        : null,
      coberto: coberturaDaMinhaVaga
        ? {
            por: perfis.get(coberturaDaMinhaVaga.usuario_entrada) ?? { id: coberturaDaMinhaVaga.usuario_entrada },
            horaInicio: coberturaDaMinhaVaga.hora_inicio,
            horaFim: coberturaDaMinhaVaga.hora_fim,
          }
        : null,
    },
    usuarios: formatarVagas(plantao_usuarios, perfis),
  }
}

// As vagas do turno, na ordem da escala
function formatarVagas(plantaoUsuarios, perfis) {
  return plantaoUsuarios
    .filter(u => u.posicao != null)
    .map(u => ({
      ...(perfis.get(u.usuario_id) ?? { id: u.usuario_id }),
      coordenador: ehVagaDeCoordenador(u.posicao),
      posicao: u.posicao,
    }))
    .sort((a, b) => a.posicao - b.posicao)
}

function formatTroca(row, perfis) {
  return {
    id: row.id,
    solicitadoEm: row.solicitado_em,
    posicao: row.posicao,
    // O horário mostrado é o da vaga trocada (o turno dela)
    plantao: row.plantoes && { ...row.plantoes, ...horarioDaVaga(row.plantoes, row.posicao) },
    usuarioSaida: perfis.get(row.usuario_saida) ?? { id: row.usuario_saida },
    usuarioEntrada: perfis.get(row.usuario_entrada) ?? { id: row.usuario_entrada },
    solicitadoPor: perfis.get(row.solicitado_por) ?? { id: row.solicitado_por },
    respondenteId: respondenteDaTroca(row),
    horaInicio: row.hora_inicio ?? null,
    horaFim: row.hora_fim ?? null,
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
