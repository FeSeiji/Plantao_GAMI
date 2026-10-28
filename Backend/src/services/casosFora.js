const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const { buscarEmPaginas } = require('./paginas')

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const CAMPOS = 'id, data, anestesista_id, segundo_anestesista_id, escalado, cirurgiao, cirurgiao_id, paciente_nome, paciente_cpf, cirurgia, hospital_id, recibo, valor, comentarios, criado_por, criado_em, atualizado_por, atualizado_em'

// Casos fora do período, já com anestesista, hospital e autores preenchidos.
// Usado pela tela de casos fora (os 500 mais recentes) e pelo BM Financeiro (todos: o período inteiro, em páginas).
async function listarCasosFora({ inicio, fim, anestesista_id, todos = false } = {}) {
  // O médico pode estar no caso como primeiro ou segundo anestesista. O id vai dentro do texto do filtro,
  // então precisa ser um uuid de verdade (uma vírgula mudaria o filtro)
  if (anestesista_id && !UUID_REGEX.test(anestesista_id)) throw new Error('anestesista_id inválido')

  const consulta = () => {
    let query = supabase
      .from('casos_fora')
      .select(CAMPOS)
      .order('data', { ascending: false })
      .order('criado_em', { ascending: false })
      .order('id', { ascending: false })
    if (inicio) query = query.gte('data', inicio)
    if (fim) query = query.lte('data', fim)
    if (anestesista_id) query = query.or(`anestesista_id.eq.${anestesista_id},segundo_anestesista_id.eq.${anestesista_id}`)
    return query
  }

  let data
  if (todos) {
    data = await buscarEmPaginas(consulta)
  } else {
    const resposta = await consulta().limit(500)
    if (resposta.error) throw resposta.error
    data = resposta.data
  }

  const [perfis, hospitais, cirurgioes] = await Promise.all([
    buscarPerfis(data.flatMap(c => [c.anestesista_id, c.segundo_anestesista_id, c.criado_por, c.atualizado_por])),
    buscarCadastro('hospitais', data.map(c => c.hospital_id)),
    buscarCadastro('cirurgioes', data.map(c => c.cirurgiao_id)),
  ])

  const pessoa = id => (id ? perfis.get(id) ?? { id } : null)
  return data.map(c => ({
    id: c.id,
    data: c.data,
    escalado: c.escalado,
    // Cirurgião da lista aparece com o nome atual (o escritório pode ter renomeado); de fora, como foi digitado
    cirurgiao: cirurgioes.get(c.cirurgiao_id)?.nome ?? c.cirurgiao,
    paciente_nome: c.paciente_nome,
    paciente_cpf: c.paciente_cpf,
    cirurgia: c.cirurgia,
    hospital: c.hospital_id ? hospitais.get(c.hospital_id) ?? { id: c.hospital_id, nome: null, ativo: false } : null,
    recibo: c.recibo,
    // numeric chega como string do banco
    valor: c.valor == null ? null : Number(c.valor),
    comentarios: c.comentarios,
    anestesista: pessoa(c.anestesista_id),
    segundoAnestesista: pessoa(c.segundo_anestesista_id),
    criadoPor: pessoa(c.criado_por),
    criadoEm: c.criado_em,
    atualizadoPor: pessoa(c.atualizado_por),
    atualizadoEm: c.atualizado_em,
  }))
}

async function buscarPerfis(usuarioIds) {
  const idsUnicos = [...new Set(usuarioIds.filter(Boolean))]
  if (idsUnicos.length === 0) return new Map()

  const { data, error } = await supabase
    .from('profiles')
    .select('id, nome, email, sigla')
    .in('id', idsUnicos)

  if (error) throw error

  return new Map(data.map(perfil => [perfil.id, perfil]))
}

// Hospitais ou cirurgiões pelos ids (as duas tabelas têm id, nome e ativo)
async function buscarCadastro(tabela, ids) {
  const idsUnicos = [...new Set(ids.filter(Boolean))]
  if (idsUnicos.length === 0) return new Map()

  const { data, error } = await supabase
    .from(tabela)
    .select('id, nome, ativo')
    .in('id', idsUnicos)

  if (error) throw error

  return new Map(data.map(h => [h.id, h]))
}

module.exports = { listarCasosFora }
