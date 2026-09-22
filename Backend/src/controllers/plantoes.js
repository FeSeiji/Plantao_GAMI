const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const TIPOS_VALIDOS = ['plantonista', 'socio']
const ROLE_POR_TIPO = { plantonista: 'anestesita_plantonista', socio: 'anestesita_socio' }

exports.createPlantao = async (req, res) => {
  const { titulo, descricao, data, hora_inicio, hora_fim, tipo, usuarios, coordenador_id, fila } = req.body

  if (!titulo || !data || !hora_inicio || !hora_fim) {
    return res.status(400).json({ error: 'titulo, data, hora_inicio e hora_fim são obrigatórios' })
  }

  if (!TIPOS_VALIDOS.includes(tipo)) {
    return res.status(400).json({ error: "tipo é obrigatório e deve ser 'plantonista' ou 'socio'" })
  }

  let membros
  try {
    membros = tipo === 'plantonista'
      ? await validarEquipePlantonista(usuarios, coordenador_id)
      : await validarFilaSocio(fila)
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }

  const { data: plantao, error } = await supabase
    .from('plantoes')
    .insert({
      titulo,
      descricao: descricao ?? null,
      data,
      hora_inicio,
      hora_fim,
      tipo,
      criado_por: req.user.id,
    })
    .select()
    .single()

  if (error) return res.status(400).json({ error: error.message })

  if (membros.length > 0) {
    const { error: membrosError } = await supabase
      .from('plantao_usuarios')
      .insert(membros.map(m => ({ plantao_id: plantao.id, ...m })))

    if (membrosError) return res.status(400).json({ error: membrosError.message })
  }

  try {
    const perfis = await buscarPerfis(membros.map(m => m.usuario_id))
    return res.status(201).json(formatPlantao({ ...plantao, plantao_usuarios: membros }, perfis))
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

exports.listPlantoes = async (req, res) => {
  const { inicio, fim } = req.query

  let query = supabase
    .from('plantoes')
    .select('*, plantao_usuarios(usuario_id, is_coordenador, posicao)')
    .order('data', { ascending: true })
    .order('hora_inicio', { ascending: true })

  if (inicio) query = query.gte('data', inicio)
  if (fim) query = query.lte('data', fim)

  const { data, error } = await query

  if (error) return res.status(500).json({ error: error.message })

  try {
    const perfis = await buscarPerfis(data.flatMap(row => row.plantao_usuarios.map(u => u.usuario_id)))
    return res.json(data.map(row => formatPlantao(row, perfis)))
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

exports.getPlantao = async (req, res) => {
  const { data, error } = await supabase
    .from('plantoes')
    .select('*, plantao_usuarios(usuario_id, is_coordenador, posicao)')
    .eq('id', req.params.id)
    .maybeSingle()

  if (error) return res.status(500).json({ error: error.message })
  if (!data) return res.status(404).json({ error: 'Plantão não encontrado' })

  try {
    const perfis = await buscarPerfis(data.plantao_usuarios.map(u => u.usuario_id))
    return res.json(formatPlantao(data, perfis))
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

exports.updatePlantao = async (req, res) => {
  const { titulo, descricao, data, hora_inicio, hora_fim } = req.body

  const updates = {}
  if (titulo !== undefined) updates.titulo = titulo
  if (descricao !== undefined) updates.descricao = descricao || null
  if (data !== undefined) updates.data = data
  if (hora_inicio !== undefined) updates.hora_inicio = hora_inicio
  if (hora_fim !== undefined) updates.hora_fim = hora_fim

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Nenhum campo para atualizar' })
  }

  const { data: plantao, error } = await supabase
    .from('plantoes')
    .update(updates)
    .eq('id', req.params.id)
    .select('*, plantao_usuarios(usuario_id, is_coordenador, posicao)')
    .maybeSingle()

  if (error) return res.status(400).json({ error: error.message })
  if (!plantao) return res.status(404).json({ error: 'Plantão não encontrado' })

  try {
    const perfis = await buscarPerfis(plantao.plantao_usuarios.map(u => u.usuario_id))
    return res.json(formatPlantao(plantao, perfis))
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

exports.removeUsuario = async (req, res) => {
  const { data: membro, error: membroError } = await supabase
    .from('plantao_usuarios')
    .select('is_coordenador')
    .eq('plantao_id', req.params.id)
    .eq('usuario_id', req.params.usuarioId)
    .maybeSingle()

  if (membroError) return res.status(500).json({ error: membroError.message })

  if (membro?.is_coordenador) {
    return res.status(400).json({ error: 'Defina outro coordenador antes de remover o atual' })
  }

  const { error } = await supabase
    .from('plantao_usuarios')
    .delete()
    .eq('plantao_id', req.params.id)
    .eq('usuario_id', req.params.usuarioId)

  if (error) return res.status(400).json({ error: error.message })

  return res.status(204).send()
}

exports.addUsuarios = async (req, res) => {
  const { data: plantao, error: plantaoError } = await supabase
    .from('plantoes')
    .select('id, tipo')
    .eq('id', req.params.id)
    .maybeSingle()

  if (plantaoError) return res.status(500).json({ error: plantaoError.message })
  if (!plantao) return res.status(404).json({ error: 'Plantão não encontrado' })

  let membros
  try {
    membros = plantao.tipo === 'plantonista'
      ? (await validarEquipePlantonista(req.body.usuarios, null, { exigirCoordenador: false }))
      : await validarFilaSocio(req.body.fila)
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }

  const { error } = await supabase
    .from('plantao_usuarios')
    .upsert(
      membros.map(m => ({ plantao_id: req.params.id, ...m })),
      { onConflict: 'plantao_id,usuario_id', ignoreDuplicates: plantao.tipo === 'plantonista' }
    )

  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Posição já ocupada nesse plantão' })
    return res.status(400).json({ error: error.message })
  }

  return res.status(201).json({ message: 'Médicos adicionados ao plantão' })
}

exports.definirCoordenador = async (req, res) => {
  const { usuario_id } = req.body
  if (!usuario_id) return res.status(400).json({ error: 'usuario_id é obrigatório' })

  const { data: plantao, error: plantaoError } = await supabase
    .from('plantoes')
    .select('id, tipo')
    .eq('id', req.params.id)
    .maybeSingle()

  if (plantaoError) return res.status(500).json({ error: plantaoError.message })
  if (!plantao) return res.status(404).json({ error: 'Plantão não encontrado' })
  if (plantao.tipo !== 'plantonista') {
    return res.status(400).json({ error: 'Somente plantões de plantonista têm coordenador' })
  }

  const { data: membro, error: membroError } = await supabase
    .from('plantao_usuarios')
    .select('usuario_id')
    .eq('plantao_id', req.params.id)
    .eq('usuario_id', usuario_id)
    .maybeSingle()

  if (membroError) return res.status(500).json({ error: membroError.message })
  if (!membro) return res.status(400).json({ error: 'O médico precisa estar na equipe do plantão para ser coordenador' })

  const { error: limparError } = await supabase
    .from('plantao_usuarios')
    .update({ is_coordenador: false })
    .eq('plantao_id', req.params.id)

  if (limparError) return res.status(400).json({ error: limparError.message })

  const { error: definirError } = await supabase
    .from('plantao_usuarios')
    .update({ is_coordenador: true })
    .eq('plantao_id', req.params.id)
    .eq('usuario_id', usuario_id)

  if (definirError) return res.status(400).json({ error: definirError.message })

  return res.json({ message: 'Coordenador definido' })
}

async function validarEquipePlantonista(usuarios, coordenadorId, { exigirCoordenador = true } = {}) {
  if (!Array.isArray(usuarios) || usuarios.length === 0) {
    throw new Error('usuarios deve ser um array não vazio de ids')
  }

  if (exigirCoordenador && (!coordenadorId || !usuarios.includes(coordenadorId))) {
    throw new Error('coordenador_id é obrigatório e deve estar entre os usuarios')
  }

  const invalidos = await usuariosSemRole(usuarios, ROLE_POR_TIPO.plantonista)
  if (invalidos.length > 0) {
    throw new Error(`Usuários sem a role anestesita_plantonista: ${invalidos.join(', ')}`)
  }

  return usuarios.map(usuario_id => ({
    usuario_id,
    is_coordenador: usuario_id === coordenadorId,
    posicao: null,
  }))
}

async function validarFilaSocio(fila) {
  if (!Array.isArray(fila) || fila.length === 0) {
    throw new Error('fila deve ser um array não vazio de { usuario_id, posicao }')
  }

  const posicaoInvalida = fila.some(
    f => !f?.usuario_id || !Number.isInteger(f.posicao) || f.posicao < 1 || f.posicao > 7
  )
  if (posicaoInvalida) {
    throw new Error('cada item da fila precisa de usuario_id e posicao (número inteiro entre 1 e 7)')
  }

  const posicoes = fila.map(f => f.posicao)
  if (new Set(posicoes).size !== posicoes.length) {
    throw new Error('posições da fila não podem se repetir')
  }

  const usuarioIds = fila.map(f => f.usuario_id)
  if (new Set(usuarioIds).size !== usuarioIds.length) {
    throw new Error('um médico não pode ocupar duas posições na mesma fila')
  }

  const invalidos = await usuariosSemRole(usuarioIds, ROLE_POR_TIPO.socio)
  if (invalidos.length > 0) {
    throw new Error(`Usuários sem a role anestesita_socio: ${invalidos.join(', ')}`)
  }

  return fila.map(({ usuario_id, posicao }) => ({ usuario_id, is_coordenador: false, posicao }))
}

async function usuariosSemRole(usuarioIds, roleEsperada) {
  const idsUnicos = [...new Set(usuarioIds)]

  const resultados = await Promise.all(
    idsUnicos.map(async id => {
      const { data, error } = await supabase.auth.admin.getUserById(id)
      const roles = data?.user?.app_metadata?.roles ?? []
      const valido = !error && roles.includes(roleEsperada)
      return { id, valido }
    })
  )

  return resultados.filter(r => !r.valido).map(r => r.id)
}

async function buscarPerfis(usuarioIds) {
  const idsUnicos = [...new Set(usuarioIds)]
  if (idsUnicos.length === 0) return new Map()

  const { data, error } = await supabase
    .from('profiles')
    .select('id, nome, email, sigla')
    .in('id', idsUnicos)

  if (error) throw error

  return new Map(data.map(perfil => [perfil.id, perfil]))
}

function formatPlantao(row, perfis) {
  const { plantao_usuarios, ...plantao } = row
  const usuarios = plantao_usuarios
    .map(u => ({
      ...(perfis.get(u.usuario_id) ?? { id: u.usuario_id }),
      coordenador: u.is_coordenador ?? false,
      posicao: u.posicao ?? null,
    }))
    .sort((a, b) => (a.posicao ?? 0) - (b.posicao ?? 0))

  return { ...plantao, usuarios }
}
