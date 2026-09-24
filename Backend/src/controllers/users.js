// users.js - sem o dotenv, as variáveis já estarão disponíveis
const { createClient } = require('@supabase/supabase-js')

const { ROLES_VALIDAS, validarDadosUsuario, criarUsuario } = require('../services/usuarios')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// ~100 anos: o Supabase não tem ban permanente, só por duração
const DURACAO_DESATIVACAO = '876000h'

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

  if (dataAlvo && horaInicio && horaFim) {
    try {
      const ocupados = await usuariosComConflito(data.map(p => p.id), dataAlvo, horaInicio, horaFim)
      return res.json(data.filter(p => !ocupados.has(p.id)))
    } catch (err) {
      console.error(err)
      return res.status(500).json({ error: err.message })
    }
  }

  return res.json(data)
}

// Gestão de usuários: lista completa com roles, CRM e status
exports.listarGestao = async (req, res) => {
  const { search } = req.query

  let query = supabase.from('profiles').select('id, nome, email, sigla, crm, crm_uf').order('nome')

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
      ativo: !estaDesativado(authUser)
    }
  }))
}

exports.criarUsuarioGestao = async (req, res) => {
  const { email, password, nome, sigla, roles, crm, crm_uf } = req.body

  if (!email || !password || !nome || !sigla) {
    return res.status(400).json({ error: 'email, password, nome e sigla são obrigatórios' })
  }

  if (!Array.isArray(roles) || roles.length === 0) {
    return res.status(400).json({ error: 'roles deve ser um array não vazio' })
  }

  if (!ehAdmin(req.user) && roles.includes('admin')) {
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

  const resultado = await criarUsuario({ email, password, nome, ...dados })
  if (resultado.error) return res.status(resultado.status).json({ error: resultado.error })

  return res.status(201).json({ id: resultado.user.id })
}

// Edita nome, sigla, roles e CRM. Campos omitidos mantêm o valor atual.
exports.atualizarUsuario = async (req, res) => {
  const { id } = req.params
  const { nome, sigla, roles, crm, crm_uf } = req.body

  const [{ data: profile, error: profileError }, { data: auth, error: authError }] = await Promise.all([
    supabase.from('profiles').select('nome, sigla, crm, crm_uf').eq('id', id).maybeSingle(),
    supabase.auth.admin.getUserById(id)
  ])

  if (authError || !auth?.user || !profile) {
    if (profileError) console.error(profileError)
    return res.status(404).json({ error: 'Usuário não encontrado' })
  }

  if (!ehAdmin(req.user) && (ehAdmin(auth.user) || (roles ?? []).includes('admin'))) {
    return res.status(403).json({ error: 'Apenas administradores podem alterar a role admin ou editar um administrador' })
  }

  if (nome !== undefined && !String(nome).trim()) {
    return res.status(400).json({ error: 'nome não pode ser vazio' })
  }

  const rolesFinais = roles ?? auth.user.app_metadata?.roles ?? []
  if (!Array.isArray(rolesFinais) || rolesFinais.length === 0) {
    return res.status(400).json({ error: 'roles deve ser um array não vazio' })
  }

  // Evita que o admin se tranque para fora da gestão
  if (id === req.user.id && ehAdmin(req.user) && !rolesFinais.includes('admin')) {
    return res.status(400).json({ error: 'Você não pode remover a própria role admin' })
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
    app_metadata: { roles: dados.roles }
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

  const bloqueio = await bloqueioAlvoAdmin(req.user, id)
  if (bloqueio) return res.status(bloqueio.status).json({ error: bloqueio.error })

  const { error } = await supabase.auth.admin.updateUserById(id, {
    ban_duration: ativo ? 'none' : DURACAO_DESATIVACAO
  })

  if (error) {
    console.error(error)
    return res.status(400).json({ error: error.message })
  }

  return res.json({ id, ativo })
}

// Envia o mesmo e-mail do "esqueci minha senha"
exports.enviarResetSenha = async (req, res) => {
  const { id } = req.params

  const { data, error } = await supabase.auth.admin.getUserById(id)
  if (error || !data?.user) return res.status(404).json({ error: 'Usuário não encontrado' })

  if (!ehAdmin(req.user) && ehAdmin(data.user)) {
    return res.status(403).json({ error: 'Apenas administradores podem alterar outro administrador' })
  }

  const { error: resetError } = await supabase.auth.resetPasswordForEmail(data.user.email, {
    redirectTo: `${process.env.FRONTEND_URL}/reset-password`
  })

  if (resetError) {
    console.error(resetError)
    return res.status(500).json({ error: resetError.message })
  }

  return res.json({ message: `E-mail de redefinição enviado para ${data.user.email}` })
}

function ehAdmin(user) {
  return (user?.app_metadata?.roles ?? []).includes('admin')
}

// Técnico gerencia usuários, mas não pode agir sobre um administrador
async function bloqueioAlvoAdmin(quemEdita, alvoId) {
  if (ehAdmin(quemEdita)) return null

  const { data, error } = await supabase.auth.admin.getUserById(alvoId)
  if (error || !data?.user) return { status: 404, error: 'Usuário não encontrado' }
  if (ehAdmin(data.user)) return { status: 403, error: 'Apenas administradores podem alterar outro administrador' }

  return null
}

function estaDesativado(authUser) {
  return Boolean(authUser?.banned_until && new Date(authUser.banned_until) > new Date())
}

async function buscarIdsComAlgumaRole(rolesAceitas) {
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  if (error) throw error

  return data.users
    .filter(u => (u.app_metadata?.roles ?? []).some(r => rolesAceitas.includes(r)))
    .map(u => u.id)
}

async function usuariosComConflito(usuarioIds, data, horaInicio, horaFim) {
  const idsUnicos = [...new Set(usuarioIds)]
  if (idsUnicos.length === 0) return new Set()

  const alvo = calcularJanela(data, horaInicio, horaFim)
  const dataAnterior = deslocarData(data, -1)
  const dataSeguinte = deslocarData(data, 1)

  const { data: plantoesProximos, error: plantoesError } = await supabase
    .from('plantoes')
    .select('id, data, hora_inicio, hora_fim')
    .gte('data', dataAnterior)
    .lte('data', dataSeguinte)

  if (plantoesError) throw plantoesError

  const plantoesConflitantes = plantoesProximos.filter(p => seSobrepoe(alvo, calcularJanela(p.data, p.hora_inicio, p.hora_fim)))
  if (plantoesConflitantes.length === 0) return new Set()

  const { data: membros, error: membrosError } = await supabase
    .from('plantao_usuarios')
    .select('usuario_id')
    .in('plantao_id', plantoesConflitantes.map(p => p.id))
    .in('usuario_id', idsUnicos)

  if (membrosError) throw membrosError

  return new Set(membros.map(m => m.usuario_id))
}

function calcularJanela(data, horaInicio, horaFim) {
  const inicio = paraMinutosAbsolutos(data, horaInicio)
  let fim = paraMinutosAbsolutos(data, horaFim)
  if (fim <= inicio) fim += 24 * 60
  return { inicio, fim }
}

function paraMinutosAbsolutos(data, hora) {
  const diasEpoch = Math.floor(Date.parse(`${data}T00:00:00Z`) / 86400000)
  const [h, m] = hora.split(':').map(Number)
  return diasEpoch * 1440 + h * 60 + m
}

function seSobrepoe(a, b) {
  return a.inicio < b.fim && b.inicio < a.fim
}

function deslocarData(data, dias) {
  const d = new Date(`${data}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}