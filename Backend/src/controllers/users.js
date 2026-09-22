// users.js - sem o dotenv, as variáveis já estarão disponíveis
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const ROLES_VALIDAS = ['anestesita_socio', 'anestesita_plantonista', 'tecnico', 'coordenador', 'admin']

exports.getUsers = async (req, res) => {
  const { search, role } = req.query

  if (role !== undefined && !ROLES_VALIDAS.includes(role)) {
    return res.status(400).json({ error: `role inválida. Permitidas: ${ROLES_VALIDAS.join(', ')}` })
  }

  let idsComRole = null
  if (role) {
    try {
      idsComRole = await buscarIdsComRole(role)
    } catch (err) {
      console.error(err)
      return res.status(500).json({ error: err.message })
    }

    if (idsComRole.length === 0) return res.json([])
  }

  let query = supabase.from('profiles').select('id, nome, email, sigla')

  if (search) {
    const termo = `%${search}%`
    query = query.or(`nome.ilike.${termo},email.ilike.${termo}`)
  }

  if (idsComRole) query = query.in('id', idsComRole)

  const { data, error } = await query

  if (error) {
    console.error(error)
    return res.status(500).json({ error: error.message })
  }

  return res.json(data)
}

async function buscarIdsComRole(role) {
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  if (error) throw error

  return data.users.filter(u => (u.app_metadata?.roles ?? []).includes(role)).map(u => u.id)
}