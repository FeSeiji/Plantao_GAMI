const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Plantão extra (migration plantoes_extras): um médico num horário livre de um dia, em paralelo ao plantão do dia
// e sem ligação com as vagas dele. Só a gestão mexe; não tem troca nem pedido de vaga.
const CAMPOS_EXTRA = 'id, data, hora_inicio, hora_fim, usuario_id, posicao, observacao, criado_por, criado_em, atualizado_por, atualizado_em'

const paraMinutos = hora => {
  const [h, m] = String(hora).split(':').map(Number)
  return h * 60 + m
}

// Duração em minutos; o fim antes do início passa da meia-noite
function duracaoDoExtra({ hora_inicio, hora_fim }) {
  const minutos = paraMinutos(hora_fim) - paraMinutos(hora_inicio)
  return minutos > 0 ? minutos : minutos + 24 * 60
}

// Extras do período (por data de início), na ordem do dia, com o horário em 'HH:MM'
async function buscarExtras({ inicio, fim, usuarioIds } = {}) {
  let query = supabase
    .from('plantoes_extras')
    .select(CAMPOS_EXTRA)
    .order('data', { ascending: true })
    .order('hora_inicio', { ascending: true })

  if (inicio) query = query.gte('data', inicio)
  if (fim) query = query.lte('data', fim)
  if (usuarioIds) query = query.in('usuario_id', usuarioIds)

  const { data, error } = await query
  if (error) throw error
  return data.map(e => ({ ...e, hora_inicio: e.hora_inicio.slice(0, 5), hora_fim: e.hora_fim.slice(0, 5) }))
}

module.exports = { CAMPOS_EXTRA, buscarExtras, duracaoDoExtra }
