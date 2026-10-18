const { createClient } = require('@supabase/supabase-js')

const { ROLES_ANESTESISTA, ROLES_CADASTRO_PUBLICO, validarDadosUsuario, criarUsuario } = require('../services/usuarios')
const { supabaseIndisponivel, ERRO_INDISPONIVEL } = require('../middleware/auth')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Cliente só para o login: signInWithPassword guarda a sessão no cliente, e no cliente acima
// isso trocaria a service role pelo token de quem entrou em todas as consultas seguintes.
const supabaseLogin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
})

exports.login = async (req, res) => {
  const { email, password } = req.body

  const { data, error } = await supabaseLogin.auth.signInWithPassword({ email, password })

  if (supabaseIndisponivel(error)) return res.status(503).json({ error: ERRO_INDISPONIVEL })
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

  // Sem isso o front entenderia que a sessão acabou e mandaria a pessoa entrar de novo
  if (supabaseIndisponivel(error)) return res.status(503).json({ error: ERRO_INDISPONIVEL })
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
    roles: app_metadata?.roles ?? [],
    is_admin: app_metadata?.is_admin === true
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

// Mesmo mínimo da tela de cadastro
const TAMANHO_MINIMO_SENHA = 8

// Troca de senha de quem está logado (sem depender do e-mail de redefinição).
// Trocar a senha pela service role encerra todas as sessões da conta, inclusive a de quem pediu,
// então a resposta traz uma sessão nova para o front guardar — os outros aparelhos precisam entrar de novo.
exports.trocarSenha = async (req, res) => {
  const { senha_atual, nova_senha } = req.body

  if (!senha_atual || !nova_senha) {
    return res.status(400).json({ error: 'senha_atual e nova_senha são obrigatórias' })
  }
  if (String(nova_senha).length < TAMANHO_MINIMO_SENHA) {
    return res.status(400).json({ error: `A nova senha precisa ter pelo menos ${TAMANHO_MINIMO_SENHA} caracteres` })
  }
  if (nova_senha === senha_atual) {
    return res.status(400).json({ error: 'A nova senha precisa ser diferente da atual' })
  }

  const { error: senhaError } = await supabaseLogin.auth.signInWithPassword({
    email: req.user.email,
    password: String(senha_atual)
  })

  // 400 e não 401: o front trata 401 como sessão vencida
  if (senhaError?.code === 'invalid_credentials') {
    return res.status(400).json({ error: 'Senha atual incorreta' })
  }
  if (senhaError) {
    console.error(senhaError)
    return res.status(500).json({ error: 'Não foi possível conferir a senha atual. Tente de novo.' })
  }

  const { error } = await supabase.auth.admin.updateUserById(req.user.id, { password: String(nova_senha) })

  if (error?.code === 'weak_password') {
    return res.status(400).json({ error: 'Senha fraca demais. Use uma senha mais longa, misturando letras, números e símbolos.' })
  }
  if (error) {
    console.error(error)
    return res.status(500).json({ error: 'Não foi possível trocar a senha.' })
  }

  const { data: nova, error: loginError } = await supabaseLogin.auth.signInWithPassword({
    email: req.user.email,
    password: String(nova_senha)
  })

  // A senha já foi trocada; sem sessão nova, o front manda entrar de novo
  if (loginError) {
    console.error(loginError)
    return res.json({ message: 'Senha alterada. Entre de novo com a nova senha.' })
  }

  // Garante que só a sessão nova sobrevive, mesmo se o Supabase deixar alguma das antigas
  const { error: signOutError } = await supabase.auth.admin.signOut(nova.session.access_token, 'others')
  if (signOutError) console.error(signOutError)

  return res.json({ message: 'Senha alterada.', ...respostaSessao(nova.session) })
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
    redirectTo: `${(process.env.FRONTEND_URL ?? '').replace(/\/+$/, '')}/reset-password` // sem barra dupla se FRONTEND_URL terminar em /
  })

  if (error) {
    console.error(error)
  }

  // Resposta genérica: não revela se o e-mail está cadastrado
  return res.json({ message: 'Se o e-mail estiver cadastrado, um link de redefinição de senha foi enviado.' })
}

// A sessão aberta pelo link do e-mail vem marcada no token (amr) com o método "otp" (ou "recovery", conforme a
// versão do Supabase), com horário depois do envio do e-mail. O token já foi validado pelo getUser antes daqui
function veioDoLinkDeRecuperacao(accessToken, user) {
  let amr
  try {
    amr = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString()).amr
  } catch {
    return false
  }
  const enviadoEm = Math.floor(Date.parse(user.recovery_sent_at ?? '') / 1000)
  return Array.isArray(amr) && amr.some(a => ['otp', 'recovery'].includes(a.method) && a.timestamp >= enviadoEm)
}

exports.resetPassword = async (req, res) => {
  const { access_token, password } = req.body

  if (!access_token || !password) {
    return res.status(400).json({ error: 'access_token e password são obrigatórios' })
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser(access_token)

  if (supabaseIndisponivel(userError)) return res.status(503).json({ error: ERRO_INDISPONIVEL })
  // O token de uma sessão comum não serve: sem isso, quem pegasse um token de login trocaria a senha sem saber a atual
  if (userError || !user || !veioDoLinkDeRecuperacao(access_token, user)) {
    return res.status(401).json({ error: 'Link de redefinição inválido ou expirado. Peça um novo em "Esqueci minha senha".' })
  }
  if (String(password).length < TAMANHO_MINIMO_SENHA) {
    return res.status(400).json({ error: `A nova senha precisa ter pelo menos ${TAMANHO_MINIMO_SENHA} caracteres` })
  }

  const { error } = await supabase.auth.admin.updateUserById(user.id, { password })

  if (error) return res.status(400).json({ error: error.message })

  return res.json({ message: 'Senha redefinida com sucesso.' })
}