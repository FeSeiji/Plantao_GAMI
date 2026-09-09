const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

exports.createPlantao = async (req, res) => {
  const { titulo, descricao, data, hora_inicio, hora_fim, usuarios } = req.body

  if (!titulo || !data || !hora_inicio || !hora_fim) {
    return res.status(400).json({ error: 'titulo, data, hora_inicio e hora_fim são obrigatórios' })
  }

  if (usuarios !== undefined && !Array.isArray(usuarios)) {
    return res.status(400).json({ error: 'usuarios deve ser um array de ids' })
  }

  const { data: plantao, error } = await supabase
    .from('plantoes')
    .insert({
      titulo,
      descricao: descricao ?? null,
      data,
      hora_inicio,
      hora_fim,
      criado_por: req.user.id,
    })
    .select()
    .single()

  if (error) return res.status(400).json({ error: error.message })

  if (usuarios?.length) {
    const { error: usuariosError } = await supabase
      .from('plantao_usuarios')
      .insert(usuarios.map(usuario_id => ({ plantao_id: plantao.id, usuario_id })))

    if (usuariosError) return res.status(400).json({ error: usuariosError.message })
  }

  return res.status(201).json({ ...plantao, usuarios: usuarios ?? [] })
}

exports.listPlantoes = async (req, res) => {
  const { data, error } = await supabase
    .from('plantoes')
    .select('*, plantao_usuarios(usuario_id)')
    .order('data', { ascending: true })
    .order('hora_inicio', { ascending: true })

  if (error) return res.status(500).json({ error: error.message })

  return res.json(data.map(formatPlantao))
}

exports.getPlantao = async (req, res) => {
  const { data, error } = await supabase
    .from('plantoes')
    .select('*, plantao_usuarios(usuario_id)')
    .eq('id', req.params.id)
    .maybeSingle()

  if (error) return res.status(500).json({ error: error.message })
  if (!data) return res.status(404).json({ error: 'Plantão não encontrado' })

  return res.json(formatPlantao(data))
}

exports.addUsuarios = async (req, res) => {
  const { usuarios } = req.body

  if (!Array.isArray(usuarios) || usuarios.length === 0) {
    return res.status(400).json({ error: 'usuarios deve ser um array não vazio de ids' })
  }

  const { data: plantao, error: plantaoError } = await supabase
    .from('plantoes')
    .select('id')
    .eq('id', req.params.id)
    .maybeSingle()

  if (plantaoError) return res.status(500).json({ error: plantaoError.message })
  if (!plantao) return res.status(404).json({ error: 'Plantão não encontrado' })

  const { error } = await supabase
    .from('plantao_usuarios')
    .upsert(
      usuarios.map(usuario_id => ({ plantao_id: req.params.id, usuario_id })),
      { onConflict: 'plantao_id,usuario_id', ignoreDuplicates: true }
    )

  if (error) return res.status(400).json({ error: error.message })

  return res.status(201).json({ message: 'Usuários adicionados ao plantão' })
}

function formatPlantao(row) {
  const { plantao_usuarios, ...plantao } = row
  return { ...plantao, usuarios: plantao_usuarios.map(u => u.usuario_id) }
}
