const { createClient } = require('@supabase/supabase-js')

const { ROLES_ANESTESISTA, ROLES_CADASTRO_PUBLICO, validarDadosUsuario, criarUsuario } = require('../services/usuarios')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Cliente só para o login: signInWithPassword guarda a sessão no cliente, e no cliente acima
// isso trocaria a service role pelo token de quem entrou em todas as consultas seguintes.
const supabaseLogin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
})

exports.login = async (req, res) => {
  const { email, password } = req.body

  const { data, error } = await supabaseLogin.auth.signInWithPassword({ email, password })

  // Conta desativada ou cadastro ainda não aprovado (os dois são ban no Supabase)
  if (error?.code === 'user_banned') {
    return res.status(403).json({ error: 'Seu cadastro está aguardando aprovação ou foi desativado. Fale com o escritório.' })
  }
  if (error) return res.status(401).json({ error: "Credenciais incorretas" })

  return res.json(respostaSessao(data.session))
}

// O access_token vale 1h; o front usa o refresh_token para pedir um novo sem pedir a senha de novo
function respostaSessao(session) {
  return {
    token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at
  }
}

exports.refresh = async (req, res) => {
  const { refresh_token } = req.body

  if (!refresh_token) return res.status(400).json({ error: 'refresh_token é obrigatório' })

  const { data, error } = await supabaseLogin.auth.refreshSession({ refresh_token })

  if (error?.code === 'user_banned') {
    return res.status(403).json({ error: 'Seu cadastro está aguardando aprovação ou foi desativado. Fale com o escritório.' })
  }
  if (error || !data.session) {
    return res.status(401).json({ error: 'Sua sessão expirou. Saia e entre novamente.' })
  }

  return res.json(respostaSessao(data.session))
}

exports.me = async (req, res) => {
  const { id, email, app_metadata } = req.user

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('nome, sigla, crm, crm_uf, telefone, data_nascimento, dias_disponiveis')
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
    dias_disponiveis: profile?.dias_disponiveis ?? null,
    roles: app_metadata?.roles ?? []
  })
}

// Edição do próprio cadastro. Email e roles ficam de fora: roles só a gestão altera.
exports.atualizarMe = async (req, res) => {
  const { id, app_metadata } = req.user
  const { nome, sigla, crm, crm_uf, telefone, data_nascimento, dias_disponiveis } = req.body

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('nome, sigla, crm, crm_uf, telefone, data_nascimento, dias_disponiveis')
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

  // Dias da semana em que o médico prefere trabalhar (0 = domingo ... 6 = sábado).
  // null = não preencheu ou marcou todos: disponível todos os dias. Só anestesistas têm.
  const roles = app_metadata?.roles ?? []
  let diasFinal = profile.dias_disponiveis
  if (!roles.some(r => ROLES_ANESTESISTA.includes(r))) {
    diasFinal = null
  } else if (dias_disponiveis !== undefined) {
    if (dias_disponiveis !== null && !Array.isArray(dias_disponiveis)) {
      return res.status(400).json({ error: 'dias_disponiveis deve ser um array de 0 (domingo) a 6 (sábado)' })
    }
    const dias = [...new Set(dias_disponiveis ?? [])]
    if (dias.some(d => !Number.isInteger(d) || d < 0 || d > 6)) {
      return res.status(400).json({ error: 'dias_disponiveis deve ser um array de 0 (domingo) a 6 (sábado)' })
    }
    diasFinal = dias_disponiveis === null || dias.length === 7 ? null : dias.sort()
  }

  let dados
  try {
    dados = await validarDadosUsuario({
      sigla: sigla ?? profile.sigla,
      roles,
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
      data_nascimento: nascimentoFinal,
      dias_disponiveis: diasFinal
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

  const proibidas = (roles ?? []).filter(r => !ROLES_CADASTRO_PUBLICO.includes(r))
  if (proibidas.length > 0) {
    return res.status(403).json({ error: `Papel não permitido no cadastro: ${proibidas.join(', ')}` })
  }

  let dados
  try {
    dados = await validarDadosUsuario({ sigla, roles: roles ?? [], crm, crm_uf })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: err.message })
  }

  if (dados.error) return res.status(400).json({ error: dados.error })

  const resultado = await criarUsuario({ email, password, nome, ...dados }, { pendente: true })
  if (resultado.error) return res.status(resultado.status).json({ error: resultado.error })

  return res.status(201).json({ id: resultado.user.id, pendente: true })
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