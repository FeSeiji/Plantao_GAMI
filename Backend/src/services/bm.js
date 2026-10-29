const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const { pontosDaVaga, categoriaDaVaga, categoriasZeradas, duasCasas } = require('./pontuacao')
const { repartirPlantao, duracaoDaVaga, duracaoDaCobertura } = require('./coberturas')
const { horarioDaVaga, turnoDaPosicao, rotuloDaVaga } = require('./posicoes')
const { buscarAfastamentosNoPeriodo } = require('./afastamentos')
const { buscarCargosDosUsuarios, contaComoSocio, contaComoSocioJr } = require('./usuarios')
const { listarCasosFora } = require('./casosFora')
const { buscarAjustesDoMes, buscarAjustesDoPeriodo } = require('./ajustesPontos')
const { buscarFinanceiroDosMeses } = require('./financeiroBm')
const { buscarEmPaginas } = require('./paginas')
const { buscarSubidasDoPeriodo, vagasQueSubiram, posicoesEfetivas } = require('./subidas')
const { buscarExtras, duracaoDoExtra } = require('./extras')
const { MES_INICIAL_CONTA_CORRENTE, calcularMes, saldoInicial, mesSeguinte } = require('./calculoBm')

// Ordem das colunas da planilha do cliente (BM DEZ 26.xlsx). Sócio que não está nela vai depois, pela sigla
const ORDEM_PLANILHA = ['ML', 'PG', 'PZ', 'NA', 'CH', 'OK', 'DI', 'AD', 'MM', 'GI', 'VI', 'TG', 'LU', 'VS']

// BM do mês, no formato da planilha do cliente. Calculado na hora a partir dos plantões — nada é gravado.
// - socios: as colunas, na ordem da planilha. Todos os sócios ativos, mais quem tem algo no mês.
//   pontos_plantoes: o que a vaga dá depois das trocas (troca por horas rateada, congresso com desconto);
//   valor_escala: o mesmo sem as substituições, ou seja, como o sócio foi escalado (a linha VALOR da planilha);
//   pontos: pontos_plantoes + ajustes manuais.
// - substituicoes: uma linha por troca aceita do mês que envolve sócio, com − para quem saiu e + para quem entrou.
//   Troca por horas: a fração das horas. Cobertura de férias: só + para quem cobre (o titular continua com a vaga).
// - casosForaBm: casos fora com valor (GAMI/ADDS, Sem nota fiscal ou sem recibo ainda), com a parte de cada sócio
//   (dois anestesistas: metade cada).
// - plantonistas: plantões por categoria e horas de plantão extra (a planilha não tem; fica abaixo do BM).
// - extrasSocios: os plantões extras dos sócios, com os pontos da posição escolhida, proporcionais às horas do
//   extra (entram no Tot. substituído, como as substituições). Plantonista e sócio Jr contam só as horas.
// - sociosJr: quantos plantões cada sócio Jr fez em cada vaga, na semana, no sábado e no domingo. Não têm pontos
//   nem entram na despesa dos plantonistas.
// - financeiro: os valores digitados do mês (faturamento, despesas, valor do plantão, valores por sócio) e o
//   histórico deles. conta_corrente.dif_mes_anterior: a diferença final do mês anterior de cada sócio, refeita em
//   cascata desde o primeiro mês da conta corrente (vazia nesse mês, que usa o saldo inicial, e antes dele).
// O noturno conta no mês em que o plantão começa.
async function montarBm(mes) {
  const [difMesAnterior, periodo] = await Promise.all([calcularDifMesAnterior(mes), carregarPeriodo([mes], { completo: true })])
  return montarDoMes(mes, dadosDoMes(periodo, mes), { difMesAnterior, comPerfis: true })
}

// Primeiro e último dia do mês 'AAAA-MM'
function limitesDoMes(mes) {
  const [ano, mesNum] = mes.split('-').map(Number)
  return { inicio: `${mes}-01`, fim: `${mes}-${String(new Date(Date.UTC(ano, mesNum, 0)).getUTCDate()).padStart(2, '0')}` }
}

// Tudo o que o BM lê do banco para os meses ('AAAA-MM', em ordem), com uma consulta por tabela para o período
// inteiro: assim a conta corrente em cascata não repete as consultas mês a mês. completo: o histórico (dos
// ajustes e do financeiro), que só a tela do mês mostra
async function carregarPeriodo(meses, { completo = false } = {}) {
  const { inicio } = limitesDoMes(meses[0])
  const { fim } = limitesDoMes(meses[meses.length - 1])

  const plantoes = await buscarEmPaginas(() =>
    supabase
      .from('plantoes')
      .select('id, data, plantao_usuarios(usuario_id, posicao)')
      .gte('data', inicio)
      .lte('data', fim)
      .order('data')
      .order('id')
  )

  const [trocas, cargos, casosFora, afastamentos, ajustes, financeiros, extras, subidas] = await Promise.all([
    buscarTrocasAceitas(inicio, fim),
    buscarCargosDosUsuarios(),
    listarCasosFora({ inicio, fim, todos: true }),
    buscarAfastamentosNoPeriodo(plantoes.flatMap(p => p.plantao_usuarios.map(u => u.usuario_id)), inicio, fim),
    completo ? buscarAjustesDoMes(inicio) : buscarAjustesDoPeriodo(inicio, `${meses[meses.length - 1]}-01`).then(a => ({ ajustes: a, historico: [] })),
    buscarFinanceiroDosMeses(meses, { comHistorico: completo }),
    buscarExtras({ inicio, fim }),
    buscarSubidasDoPeriodo(inicio, fim),
  ])
  return { plantoes, trocas, cargos, casosFora, afastamentos, ...ajustes, financeiros, extras, subidas }
}

// A parte do período que é do mês (o que montarDoMes usa)
function dadosDoMes(periodo, mes) {
  const { inicio, fim } = limitesDoMes(mes)
  const doMes = data => data >= inicio && data <= fim
  const plantoes = periodo.plantoes.filter(p => doMes(p.data))
  const idsPlantoes = new Set(plantoes.map(p => p.id))
  return {
    plantoes,
    trocas: periodo.trocas.filter(t => idsPlantoes.has(t.plantao_id)),
    cargos: periodo.cargos,
    casosFora: periodo.casosFora.filter(c => doMes(c.data)),
    afastamentos: periodo.afastamentos.filter(a => a.data_inicio <= fim && a.data_fim >= inicio),
    // Na cascata os ajustes vêm com o mês; no mês sozinho, já são só dele
    ajustes: periodo.ajustes.filter(a => !a.mes || a.mes === inicio).map(({ mes: _mes, ...a }) => a),
    historico: periodo.historico,
    financeiro: periodo.financeiros.get(mes),
    extras: periodo.extras.filter(e => doMes(e.data)),
    subidas: periodo.subidas.filter(s => idsPlantoes.has(s.plantao_id)),
  }
}

// As contas do BM de um mês, a partir dos dados já lidos. difMesAnterior: a diferença final do mês anterior (só no
// BM da tela e do Excel). incluir (só na cascata): sócios que viram coluna mesmo sem nada no mês (quem tem saldo
// vindo do mês anterior). comPerfis: busca nome e sigla de cada um (a cascata só precisa das contas)
async function montarDoMes(mes, dados, { difMesAnterior = null, incluir = [], comPerfis = false } = {}) {
  const { plantoes, trocas, cargos, casosFora, afastamentos, ajustes, historico, financeiro, extras, subidas } = dados
  const ehSocio = id => contaComoSocio(cargos.get(id)?.roles)
  const ehSocioJr = id => contaComoSocioJr(cargos.get(id)?.roles)
  // Trocas por horas e coberturas de férias: a vaga continua do titular (repartirPlantao divide)
  const coberturas = trocas.filter(t => t.hora_inicio)

  const socios = new Map()
  const socioDe = id => {
    if (!socios.has(id)) socios.set(id, { plantoes: 0, pontos_plantoes: 0, substituicoes: 0, pontos_ajustes: 0, pontos_extras: 0 })
    return socios.get(id)
  }
  for (const [id, c] of cargos) if (c.ativo && contaComoSocio(c.roles)) socioDe(id)

  const plantonistas = new Map()
  const plantonistaDe = id => {
    if (!plantonistas.has(id)) plantonistas.set(id, { categorias: categoriasZeradas(), horas_extra: 0 })
    return plantonistas.get(id)
  }
  const sociosJr = new Map()
  const horasExtraJr = new Map()

  // Subida de escala: a posição que cada vaga vale no plantão (quem está abaixo da vaga de férias sem cobertura sobe)
  const efetivasPorPlantao = new Map(plantoes.map(p => {
    const coberta = posicao => coberturas.some(c => c.plantao_id === p.id && c.posicao === posicao)
    return [p.id, posicoesEfetivas(p, vagasQueSubiram(p, p.plantao_usuarios, afastamentos, coberta, subidas))]
  }))
  const efetiva = (plantao, posicao) => efetivasPorPlantao.get(plantao.id)?.get(posicao) ?? posicao

  // Cada vaga ocupada (ou o pedaço dela, na troca por horas) conta como um plantão de quem a fez
  for (const plantao of plantoes) {
    for (const { usuario_id, posicao, fracao } of repartirPlantao(plantao, plantao.plantao_usuarios, coberturas, afastamentos)) {
      if (ehSocio(usuario_id)) {
        const acc = socioDe(usuario_id)
        acc.plantoes += 1
        acc.pontos_plantoes += pontosDaVaga(plantao.data, efetiva(plantao, posicao)) * fracao
      } else if (ehSocioJr(usuario_id)) {
        sociosJr.set(usuario_id, [...(sociosJr.get(usuario_id) ?? []), { data: plantao.data, posicao: efetiva(plantao, posicao), fracao }])
      } else {
        // categorias: quanto de cada plantão ele fez (1, ou a fração na troca por horas e no congresso)
        plantonistaDe(usuario_id).categorias[categoriaDaVaga(plantao.data, posicao)] += fracao
      }
    }
  }

  // Plantões extras: o sócio recebe os pontos da posição escolhida, proporcionais às horas do extra (6h numa vaga
  // de 12h = metade); o plantonista e o sócio Jr contam as horas
  const extrasSocios = []
  for (const e of extras) {
    const minutos = duracaoDoExtra(e)
    if (ehSocio(e.usuario_id)) {
      const pontos = e.posicao
        ? duasCasas(pontosDaVaga(e.data, e.posicao) * minutos / duracaoDaVaga(horarioDaVaga({ data: e.data }, e.posicao)))
        : 0
      socioDe(e.usuario_id).pontos_extras += pontos
      extrasSocios.push({ ...extraResumido(e), pontos: { [e.usuario_id]: pontos } })
    } else if (ehSocioJr(e.usuario_id)) {
      horasExtraJr.set(e.usuario_id, (horasExtraJr.get(e.usuario_id) ?? 0) + minutos / 60)
    } else {
      plantonistaDe(e.usuario_id).horas_extra += minutos / 60
    }
  }

  const plantaoPorId = new Map(plantoes.map(p => [p.id, p]))
  const substituicoes = []
  for (const troca of trocas) {
    const plantao = plantaoPorId.get(troca.plantao_id)
    const pontosVaga = pontosDaVaga(plantao.data, efetiva(plantao, troca.posicao))
    let tipo = 'vaga'
    let valor = pontosVaga
    if (troca.cobertura_ferias) {
      tipo = 'ferias'
    } else if (troca.hora_inicio) {
      tipo = 'horas'
      valor = pontosVaga * duracaoDaCobertura(troca.hora_inicio, troca.hora_fim) / duracaoDaVaga(horarioDaVaga(plantao, troca.posicao))
    }
    valor = duasCasas(valor)

    const pontos = {}
    if (ehSocio(troca.usuario_entrada)) pontos[troca.usuario_entrada] = valor
    if (tipo !== 'ferias' && ehSocio(troca.usuario_saida)) pontos[troca.usuario_saida] = -valor
    if (Object.keys(pontos).length === 0) continue // troca só entre plantonistas: não aparece no BM dos sócios

    for (const [id, pts] of Object.entries(pontos)) socioDe(id).substituicoes += pts
    substituicoes.push({
      id: troca.id,
      data: plantao.data,
      posicao: troca.posicao,
      tipo,
      hora_inicio: troca.hora_inicio,
      hora_fim: troca.hora_fim,
      saida: troca.usuario_saida,
      entrada: troca.usuario_entrada,
      pontos,
    })
  }
  substituicoes.sort((a, b) => a.data.localeCompare(b.data) || a.posicao - b.posicao)

  for (const ajuste of ajustes) socioDe(ajuste.usuario_id).pontos_ajustes += Number(ajuste.pontos)
  // Sócio com valor digitado no mês (ex.: GAMI PRO sem recibo) ou com saldo vindo do mês anterior também vira coluna
  for (const id of Object.keys(financeiro.socios)) if (ehSocio(id)) socioDe(id)
  const comSaldo = [...incluir, ...Object.entries(difMesAnterior ?? {}).filter(([, v]) => v !== 0).map(([id]) => id)]
  for (const id of comSaldo) if (ehSocio(id)) socioDe(id)

  // Casos fora com valor entram todos, com ou sem recibo, nas mesmas contas; o recibo só aparece no rótulo
  const casosForaBm = []
  for (const c of [...casosFora].reverse()) {
    if (!c.valor) continue
    const anestesistas = [c.anestesista?.id, c.segundoAnestesista?.id].filter(Boolean)
    const partes = {}
    for (const id of anestesistas) {
      if (ehSocio(id)) partes[id] = duasCasas((partes[id] ?? 0) + c.valor / anestesistas.length)
    }
    if (Object.keys(partes).length === 0) continue // caso só de plantonista: não há coluna para ele
    for (const id of Object.keys(partes)) socioDe(id)
    casosForaBm.push({
      id: c.id,
      data: c.data,
      escalado: c.escalado,
      recibo: c.recibo,
      hospital: c.hospital?.nome ?? null,
      cirurgia: c.cirurgia,
      valor: c.valor,
      partes,
    })
  }

  for (const acc of socios.values()) {
    acc.pontos_plantoes = duasCasas(acc.pontos_plantoes)
    acc.valor_escala = duasCasas(acc.pontos_plantoes - acc.substituicoes)
    acc.pontos_ajustes = duasCasas(acc.pontos_ajustes)
    acc.pontos_extras = duasCasas(acc.pontos_extras)
    acc.pontos = duasCasas(acc.pontos_plantoes + acc.pontos_ajustes + acc.pontos_extras)
    delete acc.substituicoes
  }
  for (const acc of plantonistas.values()) {
    for (const c of Object.keys(acc.categorias)) acc.categorias[c] = duasCasas(acc.categorias[c])
    // total: plantões; as horas extras ficam à parte
    acc.total = duasCasas(Object.values(acc.categorias).reduce((s, n) => s + n, 0))
    acc.horas_extra = duasCasas(acc.horas_extra)
  }

  const perfis = !comPerfis ? new Map() : await buscarPerfis([
    ...plantonistas.keys(),
    ...sociosJr.keys(),
    ...horasExtraJr.keys(),
    ...socios.keys(),
    ...substituicoes.flatMap(s => [s.saida, s.entrada]),
    ...ajustes.flatMap(a => [a.criado_por, a.atualizado_por]),
    ...historico.flatMap(h => [h.usuario_id, h.feito_por]),
    ...financeiro.historico.flatMap(h => [h.usuario_id, h.feito_por]),
  ].filter(Boolean))

  return {
    mes,
    socios: ordenarColunas([...socios].map(([id, valores]) => ({ ...resumoDoPerfil(id, perfis), ...valores }))),
    substituicoes: substituicoes.map(s => ({
      ...s,
      saida: resumoDoPerfil(s.saida, perfis),
      entrada: resumoDoPerfil(s.entrada, perfis),
    })),
    casosForaBm,
    plantonistas: [...plantonistas]
      .map(([id, valores]) => ({ ...resumoDoPerfil(id, perfis), ...valores }))
      .sort((a, b) => b.total - a.total || (a.nome ?? '').localeCompare(b.nome ?? '')),
    sociosJr: resumirSociosJr(sociosJr, horasExtraJr, perfis),
    extrasSocios: extrasSocios.map(e => ({ ...e, medico: resumoDoPerfil(Object.keys(e.pontos)[0], perfis) })),
    // Todos os casos fora do mês, com todos os campos, para a aba extra do Excel
    casosFora: [...casosFora].reverse(),
    ajustes: ajustes.map(({ usuario_id, criado_por, atualizado_por, pontos, ...a }) => ({
      ...a,
      pontos: Number(pontos),
      medico: resumoDoPerfil(usuario_id, perfis),
      criado_por: resumoDoPerfil(criado_por, perfis),
      atualizado_por: atualizado_por ? resumoDoPerfil(atualizado_por, perfis) : null,
    })),
    historico: historico.map(({ usuario_id, feito_por, pontos, anterior, ...h }) => ({
      ...h,
      pontos: Number(pontos),
      anterior: anterior && { ...anterior, pontos: Number(anterior.pontos) },
      medico: resumoDoPerfil(usuario_id, perfis),
      feito_por: resumoDoPerfil(feito_por, perfis),
    })),
    financeiro: {
      ...financeiro,
      conta_corrente: { desde: MES_INICIAL_CONTA_CORRENTE, dif_mes_anterior: difMesAnterior },
      historico: financeiro.historico.map(({ usuario_id, feito_por, ...h }) => ({
        ...h,
        socio: usuario_id ? resumoDoPerfil(usuario_id, perfis) : null,
        feito_por: feito_por ? resumoDoPerfil(feito_por, perfis) : null,
      })),
    },
  }
}

// O que o BM mostra de um plantão extra
const extraResumido = e => ({ id: e.id, data: e.data, hora_inicio: e.hora_inicio, hora_fim: e.hora_fim, posicao: e.posicao, observacao: e.observacao })

const DIAS_DA_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const TIPOS_DE_DIA = ['Semana', 'Sábado', 'Domingo']
const tipoDoDia = diaDaSemana => (diaDaSemana === 6 ? 'Sábado' : diaDaSemana === 0 ? 'Domingo' : 'Semana')

// Sócios Jr do mês, no formato da grade: cada um é uma coluna (socios, com o total de plantões) e cada linha é uma
// vaga num tipo de dia ("2º" do diurno de sábado), com quantos plantões cada um fez nela. plantoes: um por linha,
// com a data, para a conferência no Excel. O noturno conta no dia em que começa (o de sexta é de semana); a fração
// vem da troca por horas e do congresso. horas_extra: as horas de plantão extra de cada um, à parte do total
function resumirSociosJr(plantoesPorSocio, horasExtra, perfis) {
  const linhas = new Map()
  const plantoes = []
  for (const [id, doSocio] of plantoesPorSocio) {
    for (const { data, posicao, fracao } of doSocio) {
      const diaDaSemana = new Date(`${data}T12:00:00Z`).getUTCDay()
      const dia = tipoDoDia(diaDaSemana)
      const turno = turnoDaPosicao(posicao)
      const vaga = rotuloDaVaga(data, posicao)
      const chave = `${dia}|${turno}|${vaga}`
      const linha = linhas.get(chave) ?? { dia, turno, vaga, plantoes: {}, posicao }
      linha.plantoes[id] = duasCasas((linha.plantoes[id] ?? 0) + fracao)
      linha.posicao = Math.min(linha.posicao, posicao)
      linhas.set(chave, linha)
      plantoes.push({ socio_id: id, data, dia_semana: DIAS_DA_SEMANA[diaDaSemana], turno, vaga, fracao: duasCasas(fracao) })
    }
  }
  return {
    socios: [...new Set([...plantoesPorSocio.keys(), ...horasExtra.keys()])]
      .map(id => ({
        ...resumoDoPerfil(id, perfis),
        total: duasCasas((plantoesPorSocio.get(id) ?? []).reduce((s, p) => s + p.fracao, 0)),
        horas_extra: duasCasas(horasExtra.get(id) ?? 0),
      }))
      .sort((a, b) => (a.nome ?? '').localeCompare(b.nome ?? '')),
    // Semana, sábado e domingo; em cada um, na ordem da escala (o diurno antes do noturno)
    linhas: [...linhas.values()]
      .sort((a, b) => TIPOS_DE_DIA.indexOf(a.dia) - TIPOS_DE_DIA.indexOf(b.dia) || a.posicao - b.posicao)
      .map(({ posicao, ...l }) => l),
    plantoes: plantoes.sort((a, b) => a.data.localeCompare(b.data)),
  }
}

// Diferença final do mês anterior de cada sócio: refaz as contas de cada mês desde o primeiro da conta corrente
// (que parte do saldo inicial digitado). null no primeiro mês e antes dele
// Os meses anteriores são lidos do banco de uma vez (carregarPeriodo) e refeitos em memória, um depois do outro
async function calcularDifMesAnterior(mes) {
  if (mes <= MES_INICIAL_CONTA_CORRENTE) return null
  const meses = []
  for (let m = MES_INICIAL_CONTA_CORRENTE; m < mes; m = mesSeguinte(m)) meses.push(m)
  const periodo = await carregarPeriodo(meses)

  let dif = null
  for (const m of meses) {
    const incluir = Object.entries(dif ?? {}).filter(([, v]) => v !== 0).map(([id]) => id)
    const bm = await montarDoMes(m, dadosDoMes(periodo, m), { incluir })
    const anterior = m === MES_INICIAL_CONTA_CORRENTE ? saldoInicial(bm) : dif
    dif = calcularMes(bm, anterior).contaCorrente.diferencaFinal
  }
  return dif
}

// Trocas aceitas dos plantões do período: da vaga inteira (o médico já foi trocado em plantao_usuarios),
// por horas e coberturas de férias
async function buscarTrocasAceitas(inicio, fim) {
  const trocas = await buscarEmPaginas(() =>
    supabase
      .from('plantao_trocas')
      .select('id, plantao_id, posicao, usuario_saida, usuario_entrada, hora_inicio, hora_fim, cobertura_ferias, plantoes!inner(data)')
      .eq('status', 'aceita')
      .gte('plantoes.data', inicio)
      .lte('plantoes.data', fim)
      .order('id')
  )
  return trocas.map(({ plantoes: _plantao, ...t }) => t)
}

function ordenarColunas(socios) {
  const indice = s => {
    const i = ORDEM_PLANILHA.indexOf(s.sigla)
    return i === -1 ? ORDEM_PLANILHA.length : i
  }
  return socios.sort((a, b) => indice(a) - indice(b) || (a.sigla ?? '').localeCompare(b.sigla ?? ''))
}

const resumoDoPerfil = (id, perfis) => {
  const perfil = perfis.get(id)
  return { id, nome: perfil?.nome ?? null, email: perfil?.email ?? null, sigla: perfil?.sigla ?? null }
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

module.exports = { montarBm }
