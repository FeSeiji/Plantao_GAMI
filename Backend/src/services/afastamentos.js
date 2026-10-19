const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const TIPOS_AFASTAMENTO = ['ferias', 'congresso']
const ROTULO_TIPO = { ferias: 'férias', congresso: 'congresso' }

// Só o necessário para o indicador — a observação é visível apenas para o próprio médico
const CAMPOS_PUBLICOS = 'id, usuario_id, tipo, data_inicio, data_fim, status'

// Hoje no fuso do hospital (o servidor roda em UTC), no formato AAAA-MM-DD
function hojeLocal() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

// Status: pendente (aguarda a gestão), aprovado (bloqueia a escala) ou recusado.
// Afastamentos dos usuários que tocam o intervalo [inicio, fim] (datas AAAA-MM-DD, inclusivas).
// Por padrão só os aprovados; incluirPendentes traz também os que aguardam a gestão.
async function buscarAfastamentosNoPeriodo(usuarioIds, inicio, fim, { incluirPendentes = false } = {}) {
  const idsUnicos = [...new Set(usuarioIds)]
  if (idsUnicos.length === 0) return []

  const { data, error } = await supabase
    .from('afastamentos')
    .select(CAMPOS_PUBLICOS)
    .in('usuario_id', idsUnicos)
    .in('status', incluirPendentes ? ['aprovado', 'pendente'] : ['aprovado'])
    .lte('data_inicio', fim)
    .gte('data_fim', inicio)

  if (error) throw error
  return data
}

// Afastamento da lista que cobre esse usuário nessa data, ou null.
// Plantões que viram a noite contam pelo dia em que começam.
function afastamentoEm(afastamentos, usuarioId, data) {
  const a = afastamentos.find(x => x.usuario_id === usuarioId && x.data_inicio <= data && x.data_fim >= data)
  return a ? { id: a.id, tipo: a.tipo, data_inicio: a.data_inicio, data_fim: a.data_fim, status: a.status } : null
}

// Map usuario_id -> afastamento aprovado, só para quem está afastado nessa data
async function usuariosAfastados(usuarioIds, data) {
  const afastamentos = await buscarAfastamentosNoPeriodo(usuarioIds, data, data)
  const resultado = new Map()
  for (const id of new Set(usuarioIds)) {
    const a = afastamentoEm(afastamentos, id, data)
    if (a) resultado.set(id, a)
  }
  return resultado
}

// Férias aprovadas nessa data. Na vaga de quem está de férias não há troca: outro médico cobre o turno inteiro
// e os dois recebem os pontos (cobertura de férias). Congresso vai ter uma regra própria
async function estaDeFerias(usuarioId, data) {
  return (await usuariosAfastados([usuarioId], data)).get(usuarioId)?.tipo === 'ferias'
}

module.exports = {
  TIPOS_AFASTAMENTO,
  ROTULO_TIPO,
  hojeLocal,
  buscarAfastamentosNoPeriodo,
  afastamentoEm,
  usuariosAfastados,
  estaDeFerias,
}
