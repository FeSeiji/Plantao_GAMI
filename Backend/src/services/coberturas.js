const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Troca por horas ("cobertura"): uma troca de plantao_trocas com hora_inicio/hora_fim.
// Depois de aceita, a vaga continua do titular (usuario_saida) e o convidado (usuario_entrada)
// cobre só esse intervalo. Troca sem horário é a troca da vaga inteira.

function paraMinutos(hora) {
  const [h, m] = String(hora).split(':').map(Number)
  return h * 60 + m
}

// Minutos desde o início do plantão; o que passa da meia-noite soma 24h
function minutosDesdeInicio(plantao, hora) {
  const inicio = paraMinutos(plantao.hora_inicio)
  let m = paraMinutos(hora)
  if (m < inicio) m += 24 * 60
  return m - inicio
}

function duracaoDoPlantao(plantao) {
  const inicio = paraMinutos(plantao.hora_inicio)
  let fim = paraMinutos(plantao.hora_fim)
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
function dataDaCobertura(plantao, horaInicio) {
  if (paraMinutos(horaInicio) >= paraMinutos(plantao.hora_inicio)) return plantao.data
  const d = new Date(`${plantao.data}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

// Horas cheias, dentro do plantão, encostadas no início ou no fim, e menores que o plantão inteiro.
// Retorna a mensagem de erro ou null.
function validarIntervalo(plantao, horaInicio, horaFim) {
  const formato = /^\d{2}:00(:00)?$/
  if (!formato.test(horaInicio ?? '') || !formato.test(horaFim ?? '')) {
    return 'hora_inicio e hora_fim precisam ser horas cheias (ex.: 19:00)'
  }
  const total = duracaoDoPlantao(plantao)
  const ini = minutosDesdeInicio(plantao, horaInicio)
  let fim = minutosDesdeInicio(plantao, horaFim)
  if (fim === 0) fim = 24 * 60 // fim igual ao início do plantão só faz sentido num plantão de 24h
  if (ini >= total || fim > total || fim <= ini) return 'O intervalo precisa estar dentro do horário do plantão'
  if (ini !== 0 && fim !== total) return 'O intervalo precisa começar no início ou terminar no fim do plantão'
  if (ini === 0 && fim === total) return 'Para o plantão inteiro, use a troca normal'
  return null
}

// Coberturas valendo (troca parcial aceita) desses plantões
async function buscarCoberturas(plantaoIds) {
  const ids = [...new Set(plantaoIds)]
  if (ids.length === 0) return []
  const { data, error } = await supabase
    .from('plantao_trocas')
    .select('id, plantao_id, usuario_saida, usuario_entrada, hora_inicio, hora_fim')
    .in('plantao_id', ids)
    .eq('status', 'aceita')
    .not('hora_inicio', 'is', null)
  if (error) throw error
  return data
}

// Quem fez quanto de cada vaga do plantão: o titular fica com o que sobra e quem cobre com o intervalo.
// Retorna [{ usuario_id, posicao, coordenador, fracao, minutos }] — fracao de 0 a 1 do plantão inteiro,
// usada para ratear horas (plantonista) e pontos da posição (sócio).
function repartirPlantao(plantao, membros, coberturas) {
  const total = duracaoDoPlantao(plantao)
  const partes = []
  for (const m of membros) {
    const c = coberturas.find(x => x.plantao_id === plantao.id && x.usuario_saida === m.usuario_id)
    const base = { posicao: m.posicao ?? null, coordenador: m.is_coordenador ?? false }
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
  duracaoDoPlantao,
  duracaoDaCobertura,
  dataDaCobertura,
  validarIntervalo,
  buscarCoberturas,
}
