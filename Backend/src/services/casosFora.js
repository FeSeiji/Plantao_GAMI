const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const CAMPOS = 'id, data, anestesista_id, escalado, cirurgiao, paciente_nome, paciente_cpf, cirurgia, hospital_id, recibo, valor, comentarios, criado_por, criado_em, atualizado_por, atualizado_em'

// Casos fora do período, já com anestesista, hospital e autores preenchidos.
// Usado pela tela de casos fora e pelo BM Financeiro.
async function listarCasosFora({ inicio, fim, anestesista_id } = {}) {
  let query = supabase
    .from('casos_fora')
    .select(CAMPOS)
    .order('data', { ascending: false })
    .order('criado_em', { ascending: false })
    .limit(500)

  if (inicio) query = query.gte('data', inicio)
  if (fim) query = query.lte('data', fim)
  if (anestesista_id) query = query.eq('anestesista_id', anestesista_id)

  const { data, error } = await query
  if (error) throw error

  const [perfis, hospitais] = await Promise.all([
    buscarPerfis(data.flatMap(c => [c.anestesista_id, c.criado_por, c.atualizado_por])),
    buscarHospitais(data.map(c => c.hospital_id)),
  ])

  const pessoa = id => (id ? perfis.get(id) ?? { id } : null)
  return data.map(c => ({
    id: c.id,
    data: c.data,
    escalado: c.escalado,
    cirurgiao: c.cirurgiao,
    paciente_nome: c.paciente_nome,
    paciente_cpf: c.paciente_cpf,
    cirurgia: c.cirurgia,
    hospital: c.hospital_id ? hospitais.get(c.hospital_id) ?? { id: c.hospital_id, nome: null, ativo: false } : null,
    recibo: c.recibo,
    // numeric chega como string do banco
    valor: c.valor == null ? null : Number(c.valor),
    comentarios: c.comentarios,
    anestesista: pessoa(c.anestesista_id),
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

async function buscarHospitais(hospitalIds) {
  const idsUnicos = [...new Set(hospitalIds.filter(Boolean))]
  if (idsUnicos.length === 0) return new Map()

  const { data, error } = await supabase
    .from('hospitais')
    .select('id, nome, ativo')
    .in('id', idsUnicos)

  if (error) throw error

  return new Map(data.map(h => [h.id, h]))
}

module.exports = { listarCasosFora }
