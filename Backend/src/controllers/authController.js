const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
]

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
    .select('nome, sigla')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    console.error(error)
    return res.status(500).json({ error: error.message })
  }

  return res.json({
    id,
    email,
    nome: profile?.nome ?? null,
    sigla: profile?.sigla ?? null,
    roles: app_metadata?.roles ?? []
  })
}

exports.register = async (req, res) => {
  const { email, password, nome, sigla, roles, crm, crm_uf } = req.body

  // Validações básicas
  if (!email || !password || !nome || !sigla) {
    return res.status(400).json({ error: 'email, password, nome e sigla são obrigatórios' })
  }

  const siglaNormalizada = String(sigla).toUpperCase()

  if (!/^[A-Z]{2}$/.test(siglaNormalizada)) {
    return res.status(400).json({ error: 'sigla deve conter exatamente 2 letras' })
  }

  const { data: siglaExistente, error: siglaError } = await supabase
    .from('profiles')
    .select('id')
    .eq('sigla', siglaNormalizada)
    .maybeSingle()

  if (siglaError) {
    console.error(siglaError)
    return res.status(500).json({ error: siglaError.message })
  }

  if (siglaExistente) {
    return res.status(400).json({ error: 'Sigla já está em uso' })
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

  // Anestesistas precisam informar o CRM (número + UF)
  const rolesAnestesista = ['anestesita_socio', 'anestesita_plantonista']
  const exigeCrm = (roles ?? []).some(r => rolesAnestesista.includes(r))

  let crmNormalizado = null
  let crmUfNormalizada = null

  if (exigeCrm) {
    if (!crm || !crm_uf) {
      return res.status(400).json({ error: 'crm e crm_uf são obrigatórios para anestesistas' })
    }

    crmNormalizado = String(crm).replace(/\D/g, '')
    crmUfNormalizada = String(crm_uf).toUpperCase()

    if (!/^\d{1,7}$/.test(crmNormalizado)) {
      return res.status(400).json({ error: 'crm deve conter apenas números (até 7 dígitos)' })
    }

    if (!UFS.includes(crmUfNormalizada)) {
      return res.status(400).json({ error: 'crm_uf inválida' })
    }

    const { data: crmExistente, error: crmError } = await supabase
      .from('profiles')
      .select('id')
      .eq('crm', crmNormalizado)
      .eq('crm_uf', crmUfNormalizada)
      .maybeSingle()

    if (crmError) {
      console.error(crmError)
      return res.status(500).json({ error: crmError.message })
    }

    if (crmExistente) {
      return res.status(400).json({ error: 'CRM já cadastrado' })
    }
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // pula confirmação de email
    user_metadata: {
      nome,
      sigla: siglaNormalizada
    },
    app_metadata: {
      roles: roles ?? [] // roles controladas só pelo admin (service role)
    }
  })

  if (error) return res.status(400).json({ error: error.message })

  // O profile é criado pelo trigger on_auth_user_created; aqui só completamos o CRM
  if (exigeCrm) {
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ crm: crmNormalizado, crm_uf: crmUfNormalizada })
      .eq('id', data.user.id)

    if (profileError) {
      console.error(profileError)
      // Desfaz a criação do usuário para não deixar anestesista sem CRM
      await supabase.auth.admin.deleteUser(data.user.id)
      return res.status(500).json({ error: 'Não foi possível salvar o CRM' })
    }
  }

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