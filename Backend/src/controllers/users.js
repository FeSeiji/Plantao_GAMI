// users.js - sem o dotenv, as variáveis já estarão disponíveis
const { createClient } = require('@supabase/supabase-js')

const { ROLES_VALIDAS, DURACAO_DESATIVACAO, validarDadosUsuario, criarUsuario, estaDesativado } = require('../services/usuarios')
const { liberarEscalasFuturas } = require('../services/escalas')
const { usuariosAfastados } = require('../services/afastamentos')
const { usuariosComConflito } = require('../services/conflitos')
const { ehAdmin } = require('../middleware/auth')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

exports.getUsers = async (req, res) => {
  const { search, role, data: dataAlvo, horaInicio, horaFim } = req.query
  const rolesFiltro = role ? role.split(',').map(r => r.trim()).filter(Boolean) : null

  if (rolesFiltro) {
    const invalidas = rolesFiltro.filter(r => !ROLES_VALIDAS.includes(r))
    if (invalidas.length > 0) {
      return res.status(400).json({ error: `role inválida: ${invalidas.join(', ')}. Permitidas: ${ROLES_VALIDAS.join(', ')}` })
    }
  }

  let idsComRole = null
  if (rolesFiltro) {
    try {
      idsComRole = await buscarIdsComAlgumaRole(rolesFiltro)
    } catch (err) {
      console.error(err)
      return res.status(500).json({ error: err.message })
    }

    if (idsComRole.length === 0) return res.json([])
  }

  let query = supabase.from('profiles').select('id, nome, email, sigla, dias_disponiveis')

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

  try {
    let resultado = data

    // A tela manda o horário da vaga (o turno dela) ou o intervalo da troca por horas
    if (dataAlvo && horaInicio && horaFim) {
      const ocupados = await usuariosComConflito(
        resultado.map(p => p.id), { data: dataAlvo, hora_inicio: horaInicio, hora_fim: horaFim }
      )
      resultado = resultado.filter(p => !ocupados.has(p.id))
    }

    // Afastados (férias/congresso) continuam na lista, marcados, para o picker mostrar o motivo
    if (dataAlvo) {
      const afastados = await usuariosAfastados(resultado.map(p => p.id), dataAlvo)
      resultado = resultado.map(p => ({ ...p, afastamento: afastados.get(p.id) ?? null }))
    }

    return res.json(resultado)
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: err.message })
  }
}

// Gestão de usuários: lista completa com roles, CRM e status
exports.listarGestao = async (req, res) => {
  const { search } = req.query

  let query = supabase.from('profiles').select('id, nome, email, telefone, sigla, crm, crm_uf').order('nome')

  if (search) {
    const termo = `%${search}%`
    query = query.or(`nome.ilike.${termo},email.ilike.${termo}`)
  }

  const [{ data: profiles, error }, { data: auth, error: authError }] = await Promise.all([
    query,
    supabase.auth.admin.listUsers({ perPage: 1000 })
  ])

  if (error || authError) {
    console.error(error ?? authError)
    return res.status(500).json({ error: (error ?? authError).message })
  }

  const authPorId = new Map(auth.users.map(u => [u.id, u]))

  return res.json(profiles.map(p => {
    const authUser = authPorId.get(p.id)
    return {
      ...p,
      roles: authUser?.app_metadata?.roles ?? [],
      is_admin: ehAdmin(authUser),
      ativo: !estaDesativado(authUser),
      pendente: estaDesativado(authUser) && authUser?.app_metadata?.pendente_aprovacao === true
    }
  }))
}

exports.criarUsuarioGestao = async (req, res) => {
  const { email, password, nome, sigla, roles, crm, crm_uf, is_admin = false } = req.body

  if (!email || !password || !nome || !sigla) {
    return res.status(400).json({ error: 'email, password, nome e sigla são obrigatórios' })
  }

  if (!Array.isArray(roles) || roles.length === 0) {
    return res.status(400).json({ error: 'roles deve ser um array não vazio' })
  }

  if (typeof is_admin !== 'boolean') {
    return res.status(400).json({ error: 'is_admin deve ser true ou false' })
  }

  if (is_admin && !ehAdmin(req.user)) {
    return res.status(403).json({ error: 'Apenas administradores podem criar outro administrador' })
  }

  let dados
  try {
    dados = await validarDadosUsuario({ sigla, roles, crm, crm_uf })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: err.message })
  }

  if (dados.error) return res.status(400).json({ error: dados.error })

  const resultado = await criarUsuario({ email, password, nome, ...dados, is_admin })
  if (resultado.error) return res.status(resultado.status).json({ error: resultado.error })

  return res.status(201).json({ id: resultado.user.id })
}

// Edita nome, sigla, roles, flag admin e CRM. Campos omitidos mantêm o valor atual.
exports.atualizarUsuario = async (req, res) => {
  const { id } = req.params
  const { nome, sigla, roles, crm, crm_uf, is_admin } = req.body

  const [{ data: profile, error: profileError }, { data: auth, error: authError }] = await Promise.all([
    supabase.from('profiles').select('nome, sigla, crm, crm_uf').eq('id', id).maybeSingle(),
    supabase.auth.admin.getUserById(id)
  ])

  if (authError || !auth?.user || !profile) {
    if (profileError) console.error(profileError)
    return res.status(404).json({ error: 'Usuário não encontrado' })
  }

  if (is_admin !== undefined && typeof is_admin !== 'boolean') {
    return res.status(400).json({ error: 'is_admin deve ser true ou false' })
  }

  // Quem não é admin edita os dados de um admin, mas não concede nem retira a flag
  const mudaAdmin = is_admin !== undefined && is_admin !== ehAdmin(auth.user)
  if (mudaAdmin && !ehAdmin(req.user)) {
    return res.status(403).json({ error: 'Apenas administradores podem conceder ou remover a flag de administrador' })
  }

  // Evita que o admin se tranque para fora
  if (mudaAdmin && id === req.user.id) {
    return res.status(400).json({ error: 'Você não pode remover a própria flag de administrador' })
  }

  if (nome !== undefined && !String(nome).trim()) {
    return res.status(400).json({ error: 'nome não pode ser vazio' })
  }

  const rolesFinais = roles ?? auth.user.app_metadata?.roles ?? []
  if (!Array.isArray(rolesFinais) || rolesFinais.length === 0) {
    return res.status(400).json({ error: 'roles deve ser um array não vazio' })
  }

  let dados
  try {
    dados = await validarDadosUsuario({
      sigla: sigla ?? profile.sigla,
      roles: rolesFinais,
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
      crm_uf: dados.crm_uf
    })
    .eq('id', id)

  if (updateError) {
    console.error(updateError)
    return res.status(500).json({ error: updateError.message })
  }

  const { error: rolesError } = await supabase.auth.admin.updateUserById(id, {
    app_metadata: { roles: dados.roles, ...(mudaAdmin ? { is_admin } : {}) }
  })

  if (rolesError) {
    console.error(rolesError)
    return res.status(500).json({ error: rolesError.message })
  }

  return res.json({ id })
}

exports.alterarAtivo = async (req, res) => {
  const { id } = req.params
  const { ativo } = req.body

  if (typeof ativo !== 'boolean') {
    return res.status(400).json({ error: 'ativo deve ser true ou false' })
  }

  if (id === req.user.id && !ativo) {
    return res.status(400).json({ error: 'Você não pode desativar a própria conta' })
  }

  // Ativar também conclui a aprovação de um cadastro público pendente
  const { error } = await supabase.auth.admin.updateUserById(id, {
    ban_duration: ativo ? 'none' : DURACAO_DESATIVACAO,
    ...(ativo ? { app_metadata: { pendente_aprovacao: false } } : {})
  })

  if (error) {
    console.error(error)
    return res.status(400).json({ error: error.message })
  }

  if (!ativo) {
    // Sai das vagas e pedidos do que ainda não começou. Desativar de novo repete só o que faltou
    try {
      return res.json({ id, ativo, liberado: await liberarEscalasFuturas(id, req.user.id) })
    } catch (err) {
      console.error(err)
      return res.status(500).json({
        error: `Conta desativada, mas não foi possível tirá-la de todas as escalas futuras (${err.message}). Tente desativar de novo.`
      })
    }
  }

  return res.json({ id, ativo })
}

// Envia o mesmo e-mail do "esqueci minha senha"
exports.enviarResetSenha = async (req, res) => {
  const { id } = req.params

  const { data, error } = await supabase.auth.admin.getUserById(id)
  if (error || !data?.user) return res.status(404).json({ error: 'Usuário não encontrado' })

  const { error: resetError } = await supabase.auth.resetPasswordForEmail(data.user.email, {
    redirectTo: `${(process.env.FRONTEND_URL ?? '').replace(/\/+$/, '')}/reset-password` // sem barra dupla se FRONTEND_URL terminar em /
  })

  if (resetError) {
    console.error(resetError)
    return res.status(500).json({ error: resetError.message })
  }

  return res.json({ message: `E-mail de redefinição enviado para ${data.user.email}` })
}

async function buscarIdsComAlgumaRole(rolesAceitas) {
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  if (error) throw error

  // Contas desativadas ou com cadastro pendente não aparecem para escalar
  return data.users
    .filter(u => !estaDesativado(u))
    .filter(u => (u.app_metadata?.roles ?? []).some(r => rolesAceitas.includes(r)))
    .map(u => u.id)
}
