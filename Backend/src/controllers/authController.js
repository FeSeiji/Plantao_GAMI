const { createClient } = require('@supabase/supabase-js')

const { validarDadosUsuario, criarUsuario } = require('../services/usuarios')

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
    .select('nome, sigla, crm, crm_uf, telefone, data_nascimento')
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
    crm: profile?.crm ?? null,
    crm_uf: profile?.crm_uf ?? null,
    telefone: profile?.telefone ?? null,
    data_nascimento: profile?.data_nascimento ?? null,
    roles: app_metadata?.roles ?? []
  })
}

// Edição do próprio cadastro. Email e roles ficam de fora: roles só a gestão altera.
exports.atualizarMe = async (req, res) => {
  const { id, app_metadata } = req.user
  const { nome, sigla, crm, crm_uf, telefone, data_nascimento } = req.body

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('nome, sigla, crm, crm_uf, telefone, data_nascimento')
    .eq('id', id)
    .maybeSingle()

  if (profileError) {
    console.error(profileError)
    return res.status(500).json({ error: profileError.message })
  }
  if (!profile) return res.status(404).json({ error: 'Perfil não encontrado' })

  if (nome !== undefined && !String(nome).trim()) {
    return res.status(400).json({ error: 'nome não pode ser vazio' })
  }

  let telefoneFinal = profile.telefone
  if (telefone !== undefined) {
    telefoneFinal = telefone ? String(telefone).replace(/\D/g, '') : null
    if (telefoneFinal && !/^\d{10,11}$/.test(telefoneFinal)) {
      return res.status(400).json({ error: 'telefone deve ter DDD + número (10 ou 11 dígitos)' })
    }
  }

  let nascimentoFinal = profile.data_nascimento
  if (data_nascimento !== undefined) {
    nascimentoFinal = data_nascimento || null
    if (nascimentoFinal) {
      const valida = /^\d{4}-\d{2}-\d{2}$/.test(nascimentoFinal) && !isNaN(new Date(nascimentoFinal).getTime())
      if (!valida) return res.status(400).json({ error: 'data_nascimento inválida (use AAAA-MM-DD)' })
      if (new Date(nascimentoFinal) > new Date()) {
        return res.status(400).json({ error: 'data_nascimento não pode ser no futuro' })
      }
    }
  }

  let dados
  try {
    dados = await validarDadosUsuario({
      sigla: sigla ?? profile.sigla,
      roles: app_metadata?.roles ?? [],
      crm: crm ?? profile.crm,
      crm_uf: crm_uf ?? profile.crm_uf
    }, id)
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: err.message })
  }

  if (dados.error) return res.status(400).json({ error: dados.error })

  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      nome: nome !== undefined ? String(nome).trim() : profile.nome,
      sigla: dados.sigla,
      crm: dados.crm,
      crm_uf: dados.crm_uf,
      telefone: telefoneFinal,
      data_nascimento: nascimentoFinal
    })
    .eq('id', id)

  if (updateError) {
    console.error(updateError)
    return res.status(500).json({ error: updateError.message })
  }

  return exports.me(req, res)
}

exports.register = async (req, res) => {
  const { email, password, nome, sigla, roles, crm, crm_uf } = req.body

  // Validações básicas
  if (!email || !password || !nome || !sigla) {
    return res.status(400).json({ error: 'email, password, nome e sigla são obrigatórios' })
  }

  if (roles !== undefined && (!Array.isArray(roles) || roles.length === 0)) {
    return res.status(400).json({ error: 'roles deve ser um array não vazio' })
  }

  let dados
  try {
    dados = await validarDadosUsuario({ sigla, roles: roles ?? [], crm, crm_uf })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: err.message })
  }

  if (dados.error) return res.status(400).json({ error: dados.error })

  const resultado = await criarUsuario({ email, password, nome, ...dados })
  if (resultado.error) return res.status(resultado.status).json({ error: resultado.error })

  return res.status(201).json({ user: resultado.user })
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