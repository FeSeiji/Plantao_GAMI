const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

exports.login = async (req, res) => {
  const { email, password } = req.body

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) return res.status(401).json({ error: "Credenciais incorretas" })

  return res.json({ token: data.session.access_token })
}

exports.me = async (req, res) => {
  const { id, email, app_metadata } = req.user

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('nome')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    console.error(error)
    return res.status(500).json({ error: error.message })
  }

  return res.json({ id, email, nome: profile?.nome ?? null, roles: app_metadata?.roles ?? [] })
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

exports.forgotPassword = async (req, res) => {
  const { email } = req.body

  if (!email) {
    return res.status(400).json({ error: 'email é obrigatório' })
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.FRONTEND_URL}/reset-password`
  })

  if (error) {
    console.error(error)
  }

  // Resposta genérica: não revela se o e-mail está cadastrado
  return res.json({ message: 'Se o e-mail estiver cadastrado, um link de redefinição de senha foi enviado.' })
}

exports.resetPassword = async (req, res) => {
  const { access_token, password } = req.body

  if (!access_token || !password) {
    return res.status(400).json({ error: 'access_token e password são obrigatórios' })
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser(access_token)

  if (userError || !user) {
    return res.status(401).json({ error: 'Token inválido ou expirado' })
  }

  const { error } = await supabase.auth.admin.updateUserById(user.id, { password })

  if (error) return res.status(400).json({ error: error.message })

  return res.json({ message: 'Senha redefinida com sucesso.' })
}