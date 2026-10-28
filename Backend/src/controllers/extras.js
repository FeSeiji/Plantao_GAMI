const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const { ehData, ehUuid, erroDoPeriodo } = require('../middleware/parametros')
const { POSICOES, vagaExisteNoDia } = require('../services/posicoes')
const { ROLES_ANESTESISTA, buscarCargosDosUsuarios, contaComoSocio, contaComoSocioJr, estaDesativado } = require('../services/usuarios')
const { usuariosComConflito } = require('../services/conflitos')
const { usuariosAfastados } = require('../services/afastamentos')
const { buscarExtras, duracaoDoExtra } = require('../services/extras')

// Plantão extra (services/extras.js): todos os logados veem (calendário); a gestão cria, edita e exclui.
// O sócio recebe os pontos da posição escolhida, proporcionais às horas; plantonista e sócio Jr contam as horas
const HORA_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/
const MAX_OBSERVACAO = 200

// tipo: como o extra conta no BM, pelo cargo atual do médico
function tipoDoMedico(roles) {
  if (contaComoSocio(roles)) return 'socio'
  if (contaComoSocioJr(roles)) return 'socio_jr'
  return 'plantonista'
}

exports.listar = async (req, res) => {
  const { inicio, fim } = req.query
  const erroPeriodo = erroDoPeriodo({ inicio, fim })
  if (erroPeriodo) return res.status(400).json({ error: erroPeriodo })
  if (!inicio || !fim) return res.status(400).json({ error: 'inicio e fim são obrigatórios (AAAA-MM-DD)' })

  try {
    const extras = await buscarExtras({ inicio, fim })
    const [perfis, cargos] = await Promise.all([buscarPerfis(extras.map(e => e.usuario_id)), buscarCargosDosUsuarios()])
    return res.json(extras.map(e => formatar(e, perfis, cargos)))
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

// Corpo: data, hora_inicio, hora_fim, usuario_id, posicao (só sócio) e observacao
exports.criar = async (req, res) => {
  let campos
  try {
    campos = await validarCampos(req.body)
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }

  const { data, error } = await supabase
    .from('plantoes_extras')
    .insert({ ...campos, criado_por: req.user.id })
    .select('id')
    .single()

  if (error) return res.status(400).json({ error: error.message })
  return res.status(201).json({ id: data.id })
}

exports.atualizar = async (req, res) => {
  let campos
  try {
    campos = await validarCampos(req.body, req.params.id)
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }

  const { data, error } = await supabase
    .from('plantoes_extras')
    .update({ ...campos, atualizado_por: req.user.id, atualizado_em: new Date().toISOString() })
    .eq('id', req.params.id)
    .select('id')
    .maybeSingle()

  if (error) return res.status(400).json({ error: error.message })
  if (!data) return res.status(404).json({ error: 'Plantão extra não encontrado' })
  return res.json({ id: data.id })
}

exports.remover = async (req, res) => {
  const { data, error } = await supabase.from('plantoes_extras').delete().eq('id', req.params.id).select('id')
  if (error) return res.status(400).json({ error: error.message })
  if (data.length === 0) return res.status(404).json({ error: 'Plantão extra não encontrado' })
  return res.status(204).send()
}

// ignorarId: o próprio extra, na edição (não conflita com ele mesmo)
async function validarCampos(body, ignorarId = null) {
  const { data, hora_inicio, hora_fim, usuario_id, posicao, observacao } = body ?? {}

  if (!ehData(data)) throw new Error('data é obrigatória (AAAA-MM-DD)')
  if (!HORA_REGEX.test(hora_inicio ?? '') || !HORA_REGEX.test(hora_fim ?? '')) {
    throw new Error('hora_inicio e hora_fim são obrigatórias (HH:MM)')
  }
  if (hora_inicio === hora_fim) throw new Error('O horário de término precisa ser diferente do de início')

  if (!ehUuid(usuario_id)) throw new Error('Escolha o médico')
  const { data: auth, error } = await supabase.auth.admin.getUserById(usuario_id)
  if (error || !auth?.user) throw new Error('Médico não encontrado')
  const roles = auth.user.app_metadata?.roles ?? []
  if (!roles.some(r => ROLES_ANESTESISTA.includes(r)) || estaDesativado(auth.user)) {
    throw new Error('O plantão extra precisa ser de um médico ativo')
  }

  // Sócio: a posição define os pontos; nos outros cargos ela não vale e não é gravada
  let posicaoFinal = null
  if (contaComoSocio(roles)) {
    if (!POSICOES.includes(posicao)) throw new Error('Escolha a posição que vale para os pontos do sócio')
    if (!vagaExisteNoDia(data, posicao)) throw new Error('Essa posição não existe no fim de semana')
    posicaoFinal = posicao
  }

  const janela = { data, hora_inicio, hora_fim }
  if ((await usuariosComConflito([usuario_id], janela, { ignorarExtra: ignorarId })).size > 0) {
    throw new Error('O médico já está escalado nesse horário')
  }
  if ((await usuariosAfastados([usuario_id], data)).size > 0) {
    throw new Error('O médico está de férias ou em congresso nesse dia')
  }

  return {
    data,
    hora_inicio,
    hora_fim,
    usuario_id,
    posicao: posicaoFinal,
    observacao: String(observacao ?? '').trim().slice(0, MAX_OBSERVACAO) || null,
  }
}

function formatar(e, perfis, cargos) {
  return {
    id: e.id,
    data: e.data,
    hora_inicio: e.hora_inicio,
    hora_fim: e.hora_fim,
    horas: Math.round((duracaoDoExtra(e) / 60) * 100) / 100,
    posicao: e.posicao,
    observacao: e.observacao,
    tipo: tipoDoMedico(cargos.get(e.usuario_id)?.roles),
    medico: perfis.get(e.usuario_id) ?? { id: e.usuario_id },
  }
}

async function buscarPerfis(usuarioIds) {
  const ids = [...new Set(usuarioIds)]
  if (ids.length === 0) return new Map()
  const { data, error } = await supabase.from('profiles').select('id, nome, email, sigla').in('id', ids)
  if (error) throw error
  return new Map(data.map(p => [p.id, p]))
}

