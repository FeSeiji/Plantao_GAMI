const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

exports.login = async (req, res) => {
  const { email, password } = req.body

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) return res.status(401).json({ error: error.message })

  return res.json({ token: data.session.access_token })
}

exports.register = async (req, res) => {
  const { email, password, nome, roles } = req.body

  // Validações básicas
  if (!email || !password || !nome) {
    return res.status(400).json({ error: 'email, password e nome são obrigatórios' })
  }

  const rolesValidas = ['anestesita_socio', 'anestesita_plantonista', 'tecnico', 'coordenador', 'admin']

  if (roles !== undefined) {
    if (!Array.isArray(roles) || roles.length === 0) {
      return res.status(400).json({ error: 'roles deve ser um array não vazio' })
    }

    const invalidas = roles.filter(r => !rolesValidas.includes(r))
    if (invalidas.length > 0) {
      return res.status(400).json({
        error: `Roles inválidas: ${invalidas.join(', ')}. Permitidas: ${rolesValidas.join(', ')}`
      })
    }
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // pula confirmação de email
    user_metadata: {
      nome
    },
    app_metadata: {
      roles: roles ?? [] // roles controladas só pelo admin (service role)
    }
  })

  if (error) return res.status(400).json({ error: error.message })

  return res.status(201).json({ user: data.user })
}