const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const { pontosDaVaga, categoriaDaVaga, categoriasZeradas, duasCasas } = require('./pontuacao')
const { repartirPlantao, duracaoDaVaga, duracaoDaCobertura } = require('./coberturas')
const { horarioDaVaga } = require('./posicoes')
const { buscarAfastamentosNoPeriodo } = require('./afastamentos')
const { buscarCargosDosUsuarios, contaComoSocio } = require('./usuarios')
const { listarCasosFora } = require('./casosFora')
const { buscarAjustesDoMes } = require('./ajustesPontos')

// Ordem das colunas da planilha do cliente (BM DEZ 26.xlsx). Sócio que não está nela vai depois, pela sigla
const ORDEM_PLANILHA = ['ML', 'PG', 'PZ', 'NA', 'CH', 'OK', 'DI', 'AD', 'MM', 'GI', 'VI', 'TG', 'LU', 'VS']

// BM do mês, no formato da planilha do cliente. Calculado na hora a partir dos plantões — nada é gravado.
// - socios: as colunas, na ordem da planilha. Todos os sócios ativos, mais quem tem algo no mês.
//   pontos_plantoes: o que a vaga dá depois das trocas (troca por horas rateada, congresso com desconto);
//   valor_escala: o mesmo sem as substituições, ou seja, como o sócio foi escalado (a linha VALOR da planilha);
//   pontos: pontos_plantoes + ajustes manuais.
// - substituicoes: uma linha por troca aceita do mês que envolve sócio, com − para quem saiu e + para quem entrou.
//   Troca por horas: a fração das horas. Cobertura de férias: só + para quem cobre (o titular continua com a vaga).
// - casosForaRecibo: casos fora com recibo GAMI/ADDS, com a parte de cada sócio (dois anestesistas: metade cada).
// - plantonistas: plantões por categoria (a planilha não tem; fica abaixo do BM).
// O noturno conta no mês em que o plantão começa.
async function montarBm(mes) {
  const [ano, mesNum] = mes.split('-').map(Number)
  const inicio = `${mes}-01`
  const fim = `${mes}-${String(new Date(Date.UTC(ano, mesNum, 0)).getUTCDate()).padStart(2, '0')}`

  const { data: plantoes, error } = await supabase
    .from('plantoes')
    .select('id, data, plantao_usuarios(usuario_id, posicao)')
    .gte('data', inicio)
    .lte('data', fim)
  if (error) throw error

  const [trocas, cargos, casosFora, afastamentos, { ajustes, historico }] = await Promise.all([
    buscarTrocasAceitas(plantoes.map(p => p.id)),
    buscarCargosDosUsuarios(),
    listarCasosFora({ inicio, fim }),
    buscarAfastamentosNoPeriodo(plantoes.flatMap(p => p.plantao_usuarios.map(u => u.usuario_id)), inicio, fim),
    buscarAjustesDoMes(inicio),
  ])
  const ehSocio = id => contaComoSocio(cargos.get(id)?.roles)
  // Trocas por horas e coberturas de férias: a vaga continua do titular (repartirPlantao divide)
  const coberturas = trocas.filter(t => t.hora_inicio)

  const socios = new Map()
  const socioDe = id => {
    if (!socios.has(id)) socios.set(id, { plantoes: 0, pontos_plantoes: 0, substituicoes: 0, pontos_ajustes: 0 })
    return socios.get(id)
  }
  for (const [id, c] of cargos) if (c.ativo && contaComoSocio(c.roles)) socioDe(id)

  const plantonistas = new Map()

  // Cada vaga ocupada (ou o pedaço dela, na troca por horas) conta como um plantão de quem a fez
  for (const plantao of plantoes) {
    for (const { usuario_id, posicao, fracao } of repartirPlantao(plantao, plantao.plantao_usuarios, coberturas, afastamentos)) {
      if (ehSocio(usuario_id)) {
        const acc = socioDe(usuario_id)
        acc.plantoes += 1
        acc.pontos_plantoes += pontosDaVaga(plantao.data, posicao) * fracao
      } else {
        // categorias: quanto de cada plantão ele fez (1, ou a fração na troca por horas e no congresso)
        const acc = plantonistas.get(usuario_id) ?? { categorias: categoriasZeradas() }
        acc.categorias[categoriaDaVaga(plantao.data, posicao)] += fracao
        plantonistas.set(usuario_id, acc)
      }
    }
  }

  const plantaoPorId = new Map(plantoes.map(p => [p.id, p]))
  const substituicoes = []
  for (const troca of trocas) {
    const plantao = plantaoPorId.get(troca.plantao_id)
    const pontosVaga = pontosDaVaga(plantao.data, troca.posicao)
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

  // Casos fora com recibo GAMI/ADDS: os "Sem nota fiscal" ficam fora da planilha
  const casosForaRecibo = []
  for (const c of [...casosFora].reverse()) {
    if (c.recibo !== 'gami' || !c.valor) continue
    const anestesistas = [c.anestesista?.id, c.segundoAnestesista?.id].filter(Boolean)
    const partes = {}
    for (const id of anestesistas) {
      if (ehSocio(id)) partes[id] = duasCasas((partes[id] ?? 0) + c.valor / anestesistas.length)
    }
    if (Object.keys(partes).length === 0) continue // caso só de plantonista: não há coluna para ele
    for (const id of Object.keys(partes)) socioDe(id)
    casosForaRecibo.push({
      id: c.id,
      data: c.data,
      escalado: c.escalado,
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
    acc.pontos = duasCasas(acc.pontos_plantoes + acc.pontos_ajustes)
    delete acc.substituicoes
  }
  for (const acc of plantonistas.values()) {
    for (const c of Object.keys(acc.categorias)) acc.categorias[c] = duasCasas(acc.categorias[c])
    acc.total = duasCasas(Object.values(acc.categorias).reduce((s, n) => s + n, 0))
  }

  const perfis = await buscarPerfis([
    ...plantonistas.keys(),
    ...socios.keys(),
    ...substituicoes.flatMap(s => [s.saida, s.entrada]),
    ...ajustes.flatMap(a => [a.criado_por, a.atualizado_por]),
    ...historico.flatMap(h => [h.usuario_id, h.feito_por]),
  ].filter(Boolean))

  return {
    mes,
    socios: ordenarColunas([...socios].map(([id, valores]) => ({ ...resumoDoPerfil(id, perfis), ...valores }))),
    substituicoes: substituicoes.map(s => ({
      ...s,
      saida: resumoDoPerfil(s.saida, perfis),
      entrada: resumoDoPerfil(s.entrada, perfis),
    })),
    casosForaRecibo,
    plantonistas: [...plantonistas]
      .map(([id, valores]) => ({ ...resumoDoPerfil(id, perfis), ...valores }))
      .sort((a, b) => b.total - a.total || (a.nome ?? '').localeCompare(b.nome ?? '')),
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
  }
}

// Trocas aceitas desses plantões: da vaga inteira (o médico já foi trocado em plantao_usuarios),
// por horas e coberturas de férias
async function buscarTrocasAceitas(plantaoIds) {
  const ids = [...new Set(plantaoIds)]
  if (ids.length === 0) return []
  const { data, error } = await supabase
    .from('plantao_trocas')
    .select('id, plantao_id, posicao, usuario_saida, usuario_entrada, hora_inicio, hora_fim, cobertura_ferias')
    .in('plantao_id', ids)
    .eq('status', 'aceita')
  if (error) throw error
  return data
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
