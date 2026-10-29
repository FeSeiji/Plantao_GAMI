const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const { TURNOS, vagasQueSobem, turnoDaPosicao, turnoJaTerminou, rotuloDaVaga } = require('./posicoes')
const { buscarEmPaginas } = require('./paginas')

// Subida de escala (Dra. Aline, 28/10/2026): o titular de férias aprovadas continua na vaga, recebendo os pontos
// dela. Se o turno termina sem ninguém cobrindo as férias (a cobertura pode entrar até o fim dele), a escala sobe
// sozinha: quem está abaixo dele, nas posições numeradas do mesmo turno (vagasQueSobem), passa a valer uma posição
// acima. Antes disso, a gestão pode antecipar a subida (tabela plantao_subidas). Ninguém muda de vaga no banco: a
// subida é calculada a cada leitura, e some sozinha enquanto alguém cobrir as férias ou se as férias forem removidas.

// As subidas antecipadas pela gestão nos plantões
async function buscarSubidas(plantaoIds) {
  const ids = [...new Set(plantaoIds)]
  if (ids.length === 0) return []
  const { data, error } = await supabase.from('plantao_subidas').select('plantao_id, posicao, usuario_id').in('plantao_id', ids)
  if (error) throw error
  return data
}

// As subidas antecipadas nos plantões do período (inicio e fim: 'AAAA-MM-DD')
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

function deFerias(afastamentos, usuarioId, data) {
  return afastamentos.some(a =>
    a.usuario_id === usuarioId && a.tipo === 'ferias' && a.status === 'aprovado' && a.data_inicio <= data && a.data_fim >= data
  )
}

// Há alguém escalado abaixo da vaga, na escada do turno? Na última posição ocupada não há quem suba: a vaga de
// férias continua precisando de cobertura
function temAlguemAbaixo(plantao, membros, posicao) {
  const escada = vagasQueSobem(plantao.data, turnoDaPosicao(posicao))
  return membros.some(m => escada.indexOf(m.posicao) > escada.indexOf(posicao))
}

// As vagas do plantão em que a escala subiu. membros: [{ usuario_id, posicao }]; afastamentos: os dos membros
// (só as férias aprovadas contam); coberta(posicao): a vaga tem troca por horas ou cobertura de férias valendo;
// antecipadas: as subidas da gestão (buscarSubidas), que só valem enquanto o titular estiver na vaga
function vagasQueSubiram(plantao, membros, afastamentos, coberta, antecipadas = [], agora = new Date()) {
  const antecipada = m => antecipadas.some(s => s.plantao_id === plantao.id && s.posicao === m.posicao && s.usuario_id === m.usuario_id)
  return new Set(
    membros
      .filter(m =>
        m.posicao != null &&
        vagasQueSobem(plantao.data, turnoDaPosicao(m.posicao)).includes(m.posicao) &&
        temAlguemAbaixo(plantao, membros, m.posicao) &&
        deFerias(afastamentos, m.usuario_id, plantao.data) &&
        !coberta(m.posicao) &&
        (turnoJaTerminou(plantao.data, m.posicao, agora) || antecipada(m))
      )
      .map(m => m.posicao)
  )
}

// Map posicao -> a posição que a vaga vale com a escala subida, só para as que mudam. subiram: vagasQueSubiram.
// Na escada do turno, cada vaga sobe tantas posições quantas vagas subidas houver acima dela: com o 3º de férias,
// o 4º vale como 3º, o 5º como 4º... As duas vagas de 1º do noturno valem o mesmo: com uma delas de férias, quem
// está na outra não muda
function posicoesEfetivas(plantao, subiram) {
  const efetivas = new Map()
  if (subiram.size === 0) return efetivas
  for (const turno of Object.keys(TURNOS)) {
    const escada = vagasQueSobem(plantao.data, turno)
    escada.forEach((posicao, i) => {
      if (subiram.has(posicao)) return
      const acima = escada.slice(0, i).filter(p => subiram.has(p)).length
      if (acima > 0 && rotuloDaVaga(plantao.data, escada[i - acima]) !== rotuloDaVaga(plantao.data, posicao)) {
        efetivas.set(posicao, escada[i - acima])
      }
    })
  }
  return efetivas
}

module.exports = { buscarSubidas, buscarSubidasDoPeriodo, temAlguemAbaixo, vagasQueSubiram, posicoesEfetivas }
