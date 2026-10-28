const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const { TURNOS, vagasQueSobem } = require('./posicoes')
const { buscarEmPaginas } = require('./paginas')

// Subida de escala (migration plantao_subidas): a vaga de quem está de férias ficou sem cobertura e a gestão sobe a
// escala. Ninguém muda de vaga no banco: quem está abaixo dela, nas posições numeradas do mesmo turno, passa a valer
// uma posição acima. Quem está de férias continua na vaga e recebe os pontos dela.

async function buscarSubidas(plantaoIds) {
  const ids = [...new Set(plantaoIds)]
  if (ids.length === 0) return []
  const { data, error } = await supabase.from('plantao_subidas').select('plantao_id, posicao, usuario_id').in('plantao_id', ids)
  if (error) throw error
  return data
}

// As subidas dos plantões do período (inicio e fim: 'AAAA-MM-DD')
async function buscarSubidasDoPeriodo(inicio, fim) {
  const subidas = await buscarEmPaginas(() =>
    supabase
      .from('plantao_subidas')
      .select('plantao_id, posicao, usuario_id, plantoes!inner(data)')
      .gte('plantoes.data', inicio)
      .lte('plantoes.data', fim)
      .order('id')
  )
  return subidas.map(({ plantoes: _plantao, ...s }) => s)
}

// As subidas que valem no plantão: a do titular que continua na vaga. membros: [{ usuario_id, posicao }]
function subidasValidas(plantao, membros, subidas) {
  return subidas.filter(s => s.plantao_id === plantao.id && membros.some(m => m.posicao === s.posicao && m.usuario_id === s.usuario_id))
}

// Map posicao -> a posição que a vaga vale com as subidas do plantão, só para as que mudam. Na escada do turno
// (vagasQueSobem), cada vaga sobe tantas posições quantas subidas houver acima dela: com o 3º de férias e subido,
// o 4º vale como 3º, o 5º como 4º...
function posicoesEfetivas(plantao, membros, subidas) {
  const subiram = new Set(subidasValidas(plantao, membros, subidas).map(s => s.posicao))
  const efetivas = new Map()
  if (subiram.size === 0) return efetivas
  for (const turno of Object.keys(TURNOS)) {
    const escada = vagasQueSobem(plantao.data, turno)
    escada.forEach((posicao, i) => {
      if (subiram.has(posicao)) return
      const acima = escada.slice(0, i).filter(p => subiram.has(p)).length
      if (acima > 0) efetivas.set(posicao, escada[i - acima])
    })
  }
  return efetivas
}

module.exports = { buscarSubidas, buscarSubidasDoPeriodo, subidasValidas, posicoesEfetivas }
