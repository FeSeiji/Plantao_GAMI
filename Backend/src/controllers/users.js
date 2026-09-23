// users.js - sem o dotenv, as variáveis já estarão disponíveis
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const ROLES_VALIDAS = ['anestesita_socio', 'anestesita_plantonista', 'tecnico','admin']

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