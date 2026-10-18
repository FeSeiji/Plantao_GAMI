const { randomUUID } = require('crypto')
const { createClient } = require('@supabase/supabase-js')

const { ROLES_ANESTESISTA } = require('../services/usuarios')
const { ehGestao } = require('../middleware/auth')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Ficha anestésica: registro avulso (sem ligação com plantão), visível para todos os usuários logados.
// Edita e exclui quem criou ou a gestão (escritório, técnico e admin).
const BUCKET = 'fichas-anestesicas'
const TIPOS_ANESTESIA = ['raquianestesia', 'duplo_bloqueio', 'geral', 'peridural', 'outros']
const MAX_FOTOS = 1
const MAX_BYTES_FOTO = 3 * 1024 * 1024
const MIME_FOTO = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const VALIDADE_LINK_FOTO = 60 * 60 // 1h

const CAMPOS = 'id, data, data_fim, hora_inicio, hora_fim, anestesista_ids, tipo_anestesia, tipo_outro, observacoes, valor, fotos, criado_por, criado_em, atualizado_por, atualizado_em'
const MAX_OBSERVACOES = 2000
const MAX_ANESTESISTAS = 10
const MAX_VALOR = 99999999.99

const DATA_REGEX = /^\d{4}-\d{2}-\d{2}$/
const HORA_REGEX = /^([01]\d|2[0-3]):[0-5]\d(:00)?$/

const dataValida = valor => DATA_REGEX.test(valor ?? '') && !isNaN(new Date(`${valor}T00:00:00Z`).getTime())

const podeEditar = (user, ficha) => ehGestao(user) || ficha.criado_por === user.id

exports.listar = async (req, res) => {
  const { inicio, fim, anestesista_id } = req.query

  let query = supabase
    .from('fichas_anestesicas')
    .select(CAMPOS)
    .order('data', { ascending: false })
    .order('hora_inicio', { ascending: false })
    .limit(200)

  if (inicio) query = query.gte('data', inicio)
  if (fim) query = query.lte('data', fim)
  if (anestesista_id) query = query.contains('anestesista_ids', [anestesista_id])

  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })

  try {
    const perfis = await buscarPerfis(data.flatMap(f => [...f.anestesista_ids, f.criado_por, f.atualizado_por]))
    return res.json(data.map(f => formatar(f, perfis, req.user)))
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

// Detalhe com links temporários das fotos (o bucket é privado)
exports.obter = async (req, res) => {
  const { data: ficha, error } = await supabase
    .from('fichas_anestesicas')
    .select(CAMPOS)
    .eq('id', req.params.id)
    .maybeSingle()

  if (error) return res.status(500).json({ error: error.message })
  if (!ficha) return res.status(404).json({ error: 'Ficha não encontrada' })

  try {
    const perfis = await buscarPerfis([...ficha.anestesista_ids, ficha.criado_por, ficha.atualizado_por])
    return res.json({ ...formatar(ficha, perfis, req.user), fotos: await linksDasFotos(ficha.fotos) })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

// Corpo: data, data_fim, hora_inicio, hora_fim, anestesista_ids, tipo_anestesia, tipo_outro, observacoes, valor, fotos_novas (data URLs)
exports.criar = async (req, res) => {
  let campos
  try {
    campos = await validarCampos(req.body)
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }

  const novas = Array.isArray(req.body.fotos_novas) ? req.body.fotos_novas : []
  if (novas.length > MAX_FOTOS) return res.status(400).json({ error: 'Só é possível anexar uma foto por ficha' })

  let enviadas
  try {
    enviadas = await enviarFotos(novas)
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }

  const { data: ficha, error } = await supabase
    .from('fichas_anestesicas')
    .insert({ ...campos, fotos: enviadas, criado_por: req.user.id })
    .select(CAMPOS)
    .single()

  if (error) {
    await apagarFotos(enviadas)
    return res.status(400).json({ error: error.message })
  }

  return res.status(201).json({ id: ficha.id })
}

// Corpo: os campos da ficha, fotos_mantidas (caminhos que continuam) e fotos_novas (data URLs)
exports.atualizar = async (req, res) => {
  const { data: atual, error: atualError } = await supabase
    .from('fichas_anestesicas')
    .select('id, criado_por, fotos')
    .eq('id', req.params.id)
    .maybeSingle()

  if (atualError) return res.status(500).json({ error: atualError.message })
  if (!atual) return res.status(404).json({ error: 'Ficha não encontrada' })
  if (!podeEditar(req.user, atual)) {
    return res.status(403).json({ error: 'Só quem criou a ficha ou a gestão pode editá-la' })
  }

  let campos
  try {
    campos = await validarCampos(req.body)
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }

  const mantidas = (Array.isArray(req.body.fotos_mantidas) ? req.body.fotos_mantidas : [])
    .filter(caminho => atual.fotos.includes(caminho))
  const novas = Array.isArray(req.body.fotos_novas) ? req.body.fotos_novas : []
  if (mantidas.length + novas.length > MAX_FOTOS) {
    return res.status(400).json({ error: 'Só é possível anexar uma foto por ficha' })
  }

  let enviadas
  try {
    enviadas = await enviarFotos(novas)
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }

  const { error } = await supabase
    .from('fichas_anestesicas')
    .update({
      ...campos,
      fotos: [...mantidas, ...enviadas],
      atualizado_por: req.user.id,
      atualizado_em: new Date().toISOString(),
    })
    .eq('id', atual.id)

  if (error) {
    await apagarFotos(enviadas)
    return res.status(400).json({ error: error.message })
  }

  // Só apaga as fotos retiradas depois que a ficha foi salva sem elas
  await apagarFotos(atual.fotos.filter(caminho => !mantidas.includes(caminho)))

  return res.json({ id: atual.id })
}

exports.remover = async (req, res) => {
  const { data: ficha, error: buscaError } = await supabase
    .from('fichas_anestesicas')
    .select('id, criado_por, fotos')
    .eq('id', req.params.id)
    .maybeSingle()

  if (buscaError) return res.status(500).json({ error: buscaError.message })
  if (!ficha) return res.status(404).json({ error: 'Ficha não encontrada' })
  if (!podeEditar(req.user, ficha)) {
    return res.status(403).json({ error: 'Só quem criou a ficha ou a gestão pode excluí-la' })
  }

  const { error } = await supabase.from('fichas_anestesicas').delete().eq('id', ficha.id)
  if (error) return res.status(400).json({ error: error.message })

  await apagarFotos(ficha.fotos)
  return res.status(204).send()
}

async function validarCampos(body) {
  const { data, data_fim, hora_inicio, hora_fim, anestesista_ids, tipo_anestesia, tipo_outro, observacoes, valor } = body ?? {}

  if (!dataValida(data)) throw new Error('data é obrigatória (AAAA-MM-DD)')
  if (!dataValida(data_fim)) throw new Error('data_fim é obrigatória (AAAA-MM-DD)')
  if (!HORA_REGEX.test(hora_inicio ?? '') || !HORA_REGEX.test(hora_fim ?? '')) {
    throw new Error('hora_inicio e hora_fim são obrigatórias (HH:MM)')
  }
  // Datas em AAAA-MM-DD comparam certo como texto
  if (data_fim < data) throw new Error('A data final não pode ser antes da data inicial')
  if (data_fim === data && hora_fim.slice(0, 5) <= hora_inicio.slice(0, 5)) {
    throw new Error('No mesmo dia, a hora de término precisa ser depois da de início')
  }
  if (!TIPOS_ANESTESIA.includes(tipo_anestesia)) {
    throw new Error('tipo_anestesia inválido')
  }
  const outro = tipo_anestesia === 'outros' ? String(tipo_outro ?? '').trim().slice(0, 100) : null
  if (tipo_anestesia === 'outros' && !outro) {
    throw new Error('Descreva o tipo de anestesia em "outros"')
  }
  // Um ou mais médicos, na ordem em que foram escolhidos
  const ids = [...new Set(Array.isArray(anestesista_ids) ? anestesista_ids.filter(Boolean) : [])]
  if (ids.length === 0) throw new Error('Escolha pelo menos um anestesista')
  if (ids.length > MAX_ANESTESISTAS) throw new Error(`No máximo ${MAX_ANESTESISTAS} anestesistas por ficha`)

  const usuarios = await Promise.all(ids.map(id => supabase.auth.admin.getUserById(id)))
  for (const { data: auth, error } of usuarios) {
    if (error || !auth?.user) throw new Error('Anestesista não encontrado')
    if (!(auth.user.app_metadata?.roles ?? []).some(r => ROLES_ANESTESISTA.includes(r))) {
      throw new Error('Os anestesistas precisam ser médicos (sócios ou plantonistas)')
    }
  }

  // Valor em R$, opcional (mesma regra dos casos fora)
  let valorNormalizado = null
  if (valor != null && valor !== '') {
    valorNormalizado = Number(String(valor).replace(',', '.'))
    if (!Number.isFinite(valorNormalizado) || valorNormalizado < 0 || valorNormalizado > MAX_VALOR) {
      throw new Error('Valor inválido')
    }
    valorNormalizado = Math.round(valorNormalizado * 100) / 100
  }

  const obs = String(observacoes ?? '').trim().slice(0, MAX_OBSERVACOES) || null
  return {
    data, data_fim, hora_inicio, hora_fim, anestesista_ids: ids,
    tipo_anestesia, tipo_outro: outro, observacoes: obs, valor: valorNormalizado,
  }
}

// Recebe data URLs ("data:image/jpeg;base64,...") e grava no bucket. Retorna os caminhos.
async function enviarFotos(dataUrls) {
  const enviadas = []
  for (const dataUrl of dataUrls) {
    const m = /^data:(image\/[a-z]+);base64,(.+)$/.exec(String(dataUrl))
    const extensao = m && MIME_FOTO[m[1]]
    if (!extensao) {
      await apagarFotos(enviadas)
      throw new Error('Foto em formato inválido (use JPG, PNG ou WEBP)')
    }
    const buffer = Buffer.from(m[2], 'base64')
    if (buffer.length > MAX_BYTES_FOTO) {
      await apagarFotos(enviadas)
      throw new Error('Foto muito grande (máximo 3 MB)')
    }
    const caminho = `${randomUUID()}.${extensao}`
    const { error } = await supabase.storage.from(BUCKET).upload(caminho, buffer, { contentType: m[1] })
    if (error) {
      await apagarFotos(enviadas)
      throw new Error(`Não foi possível enviar a foto: ${error.message}`)
    }
    enviadas.push(caminho)
  }
  return enviadas
}

async function apagarFotos(caminhos) {
  if (!caminhos || caminhos.length === 0) return
  const { error } = await supabase.storage.from(BUCKET).remove(caminhos)
  if (error) console.error('Falha ao apagar fotos de ficha:', error.message)
}

async function linksDasFotos(caminhos) {
  if (!caminhos || caminhos.length === 0) return []
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(caminhos, VALIDADE_LINK_FOTO)
  if (error) throw error
  return data.map((d, i) => ({ caminho: caminhos[i], url: d.signedUrl }))
}

function formatar(f, perfis, user) {
  const pessoa = id => (id ? perfis.get(id) ?? { id } : null)
  return {
    id: f.id,
    data: f.data,
    data_fim: f.data_fim ?? f.data,
    hora_inicio: f.hora_inicio,
    hora_fim: f.hora_fim,
    tipo_anestesia: f.tipo_anestesia,
    tipo_outro: f.tipo_outro,
    observacoes: f.observacoes,
    valor: f.valor == null ? null : Number(f.valor),
    anestesistas: f.anestesista_ids.map(pessoa),
    qtdFotos: f.fotos.length,
    criadoPor: pessoa(f.criado_por),
    criadoEm: f.criado_em,
    atualizadoPor: pessoa(f.atualizado_por),
    atualizadoEm: f.atualizado_em,
    podeEditar: podeEditar(user, f),
  }
}

async function buscarPerfis(usuarioIds) {
  const idsUnicos = [...new Set(usuarioIds.filter(Boolean))]
  if (idsUnicos.length === 0) return new Map()

  const { data, error } = await supabase
    .from('profiles')
    .select('id, nome, email, sigla')
    .in('id', idsUnicos)

  if (error) throw error

  return new Map(data.map(perfil => [perfil.id, perfil]))
}
