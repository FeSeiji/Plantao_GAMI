// users.js - sem o dotenv, as variáveis já estarão disponíveis
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

exports.getUsers = async (req, res) => {
  const { search } = req.query

  let query = supabase.from('profiles').select('id, nome, email, sigla')

  if (search) {
    const termo = `%${search}%`
    query = query.or(`nome.ilike.${termo},email.ilike.${termo}`)
  }

  const { data, error } = await query

  if (error) {
    console.error(error)
    return res.status(500).json({ error: error.message })
  }

  return res.json(data)
}