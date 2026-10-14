const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const { horarioDaVaga } = require('./posicoes')
const { buscarCoberturas, dataDaCobertura, duracaoDaCobertura } = require('./coberturas')

// Médicos ocupados na janela { data, hora_inicio, hora_fim }: escalados numa vaga cujo turno se sobrepõe a ela
// (em qualquer plantão perto dessa data, inclusive o próprio) ou cobrindo parte de uma vaga nesse horário.
// O diurno (07h–19h) e o noturno (19h–07h) só se encostam, então o mesmo médico pode fazer os dois.
// ignorar: vagas { plantao_id, posicao } que não contam, como a que o médico está deixando.
async function usuariosComConflito(usuarioIds, janela, { ignorar = [] } = {}) {
  const idsUnicos = [...new Set(usuarioIds)]
  if (idsUnicos.length === 0) return new Set()

  const alvo = calcularJanela(janela.data, janela.hora_inicio, janela.hora_fim)

  const { data: plantoes, error: plantoesError } = await supabase
    .from('plantoes')
    .select('id, data')
    .gte('data', deslocarData(janela.data, -1))
    .lte('data', deslocarData(janela.data, 1))

  if (plantoesError) throw plantoesError
  if (plantoes.length === 0) return new Set()
  const porId = new Map(plantoes.map(p => [p.id, p]))

  const { data: vagas, error: vagasError } = await supabase
    .from('plantao_usuarios')
    .select('plantao_id, usuario_id, posicao')
    .in('plantao_id', [...porId.keys()])
    .in('usuario_id', idsUnicos)

  if (vagasError) throw vagasError

  const ocupados = new Set()
  for (const v of vagas) {
    if (ignorar.some(i => i.plantao_id === v.plantao_id && i.posicao === v.posicao)) continue
    const h = horarioDaVaga(porId.get(v.plantao_id), v.posicao)
    if (seSobrepoe(alvo, calcularJanela(h.data, h.hora_inicio, h.hora_fim))) ocupados.add(v.usuario_id)
  }

  // Quem cobre parte de uma vaga (troca por horas) está ocupado só no intervalo coberto
  for (const c of await buscarCoberturas([...porId.keys()])) {
    if (!idsUnicos.includes(c.usuario_entrada)) continue
    const inicio = paraMinutosAbsolutos(dataDaCobertura(horarioDaVaga(porId.get(c.plantao_id), c.posicao), c.hora_inicio), c.hora_inicio)
    if (seSobrepoe(alvo, { inicio, fim: inicio + duracaoDaCobertura(c.hora_inicio, c.hora_fim) })) ocupados.add(c.usuario_entrada)
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

module.exports = { usuariosComConflito }
