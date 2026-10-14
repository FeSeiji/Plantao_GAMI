const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const { horarioDaVaga, ehVagaDeCoordenador } = require('./posicoes')

// Troca por horas ("cobertura"): uma troca de plantao_trocas com hora_inicio/hora_fim.
// Depois de aceita, a vaga continua do titular (usuario_saida) e o convidado (usuario_entrada)
// cobre só esse intervalo. Troca sem horário é a troca da vaga inteira.
// "vaga" abaixo é o horário da vaga: { data, hora_inicio, hora_fim } do turno dela (horarioDaVaga).

function paraMinutos(hora) {
  const [h, m] = String(hora).split(':').map(Number)
  return h * 60 + m
}

// Minutos desde o início da vaga; o que passa da meia-noite soma 24h
function minutosDesdeInicio(vaga, hora) {
  const inicio = paraMinutos(vaga.hora_inicio)
  let m = paraMinutos(hora)
  if (m < inicio) m += 24 * 60
  return m - inicio
}

function duracaoDaVaga(vaga) {
  const inicio = paraMinutos(vaga.hora_inicio)
  let fim = paraMinutos(vaga.hora_fim)
  if (fim <= inicio) fim += 24 * 60
  return fim - inicio
}

// Duração da cobertura em minutos (pode passar da meia-noite)
function duracaoDaCobertura(horaInicio, horaFim) {
  const inicio = paraMinutos(horaInicio)
  let fim = paraMinutos(horaFim)
  if (fim <= inicio) fim += 24 * 60
  return fim - inicio
}

// Dia em que a cobertura começa: o do plantão, ou o seguinte se ela começa depois da meia-noite
function dataDaCobertura(vaga, horaInicio) {
  if (paraMinutos(horaInicio) >= paraMinutos(vaga.hora_inicio)) return vaga.data
  const d = new Date(`${vaga.data}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

// Horas cheias, dentro do turno da vaga, encostadas no início ou no fim, e menores que o turno inteiro.
// Retorna a mensagem de erro ou null.
function validarIntervalo(vaga, horaInicio, horaFim) {
  const formato = /^\d{2}:00(:00)?$/
  if (!formato.test(horaInicio ?? '') || !formato.test(horaFim ?? '')) {
    return 'hora_inicio e hora_fim precisam ser horas cheias (ex.: 19:00)'
  }
  const total = duracaoDaVaga(vaga)
  const ini = minutosDesdeInicio(vaga, horaInicio)
  let fim = minutosDesdeInicio(vaga, horaFim)
  if (fim === 0) fim = 24 * 60 // fim igual ao início da vaga só faz sentido num turno de 24h
  if (ini >= total || fim > total || fim <= ini) return 'O intervalo precisa estar dentro do horário da vaga'
  if (ini !== 0 && fim !== total) return 'O intervalo precisa começar no início ou terminar no fim da vaga'
  if (ini === 0 && fim === total) return 'Para a vaga inteira, use a troca normal'
  return null
}

// Coberturas valendo (troca parcial aceita) desses plantões
async function buscarCoberturas(plantaoIds) {
  const ids = [...new Set(plantaoIds)]
  if (ids.length === 0) return []
  const { data, error } = await supabase
    .from('plantao_trocas')
    .select('id, plantao_id, posicao, usuario_saida, usuario_entrada, hora_inicio, hora_fim')
    .in('plantao_id', ids)
    .eq('status', 'aceita')
    .not('hora_inicio', 'is', null)
  if (error) throw error
  return data
}

// Quem fez quanto de cada vaga do plantão: o titular fica com o que sobra e quem cobre com o intervalo.
// Retorna [{ usuario_id, posicao, coordenador, fracao, minutos }] — fracao de 0 a 1 da vaga inteira,
// usada para ratear horas (plantonista) e pontos da posição (sócio).
function repartirPlantao(plantao, membros, coberturas) {
  const partes = []
  for (const m of membros) {
    const total = duracaoDaVaga(horarioDaVaga(plantao, m.posicao))
    const c = coberturas.find(x => x.plantao_id === plantao.id && x.posicao === m.posicao && x.usuario_saida === m.usuario_id)
    const base = { posicao: m.posicao, coordenador: ehVagaDeCoordenador(m.posicao) }
    if (!c) {
      partes.push({ ...base, usuario_id: m.usuario_id, fracao: 1, minutos: total })
      continue
    }
    const coberto = duracaoDaCobertura(c.hora_inicio, c.hora_fim)
    partes.push({ ...base, usuario_id: m.usuario_id, fracao: (total - coberto) / total, minutos: total - coberto })
    partes.push({ ...base, usuario_id: c.usuario_entrada, fracao: coberto / total, minutos: coberto })
  }
  return partes
}

module.exports = {
  repartirPlantao,
  duracaoDaVaga,
  duracaoDaCobertura,
  dataDaCobertura,
  validarIntervalo,
  buscarCoberturas,
}
