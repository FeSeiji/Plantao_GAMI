const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const { contaComoSocio } = require('../services/usuarios')
const { CAMPOS_AJUSTE } = require('../services/ajustesPontos')

// Ajustes manuais de pontos do BM: só sócios recebem, em qualquer mês, e só quem tem a flag admin lança.
// O histórico é gravado pelo trigger do banco (migration ajustes_pontos); excluir só marca excluido_em.
const MAX_MOTIVO = 200
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Pontos com duas casas, diferentes de zero e abaixo de mil (um ajuste maior é quase certamente erro de digitação)
function lerPontos(valor) {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return { error: 'Informe os pontos como número' }
  const pontos = Math.round(valor * 100) / 100
  if (pontos === 0) return { error: 'Os pontos não podem ser zero' }
  if (Math.abs(pontos) >= 1000) return { error: 'O ajuste deve ficar entre -999,99 e 999,99 pontos' }
  return { pontos }
}

function lerMotivo(valor) {
  const motivo = String(valor ?? '').trim().slice(0, MAX_MOTIVO)
  if (!motivo) return { error: 'Informe o motivo do ajuste' }
  return { motivo }
}

// Corpo: usuario_id, mes ('AAAA-MM'), pontos (número, negativo para tirar) e motivo
exports.criar = async (req, res) => {
  const { usuario_id, mes } = req.body ?? {}

  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes ?? '')) {
    return res.status(400).json({ error: "mes é obrigatório no formato 'AAAA-MM'" })
  }
  const pontos = lerPontos(req.body?.pontos)
  if (pontos.error) return res.status(400).json({ error: pontos.error })
  const motivo = lerMotivo(req.body?.motivo)
  if (motivo.error) return res.status(400).json({ error: motivo.error })

  if (!UUID_REGEX.test(usuario_id ?? '')) return res.status(400).json({ error: 'Escolha o médico' })
  const { data: alvo, error: alvoError } = await supabase.auth.admin.getUserById(usuario_id)
  if (alvoError || !alvo?.user) return res.status(400).json({ error: 'Médico não encontrado' })
  if (!contaComoSocio(alvo.user.app_metadata?.roles)) {
    return res.status(400).json({ error: 'Por enquanto só sócios recebem ajuste de pontos' })
  }

  const { data, error } = await supabase
    .from('ajustes_pontos')
    .insert({
      usuario_id,
      mes: `${mes}-01`,
      pontos: pontos.pontos,
      motivo: motivo.motivo,
      criado_por: req.user.id,
    })
    .select(CAMPOS_AJUSTE)
    .single()

  if (error) return res.status(400).json({ error: error.message })
  return res.status(201).json(data)
}

// Corpo: pontos e/ou motivo. Para trocar o médico ou o mês, exclua e lance de novo
exports.atualizar = async (req, res) => {
  if (!UUID_REGEX.test(req.params.id)) return res.status(404).json({ error: 'Ajuste não encontrado' })

  const { data: atual, error: atualError } = await supabase
    .from('ajustes_pontos')
    .select(CAMPOS_AJUSTE)
    .eq('id', req.params.id)
    .is('excluido_em', null)
    .maybeSingle()

  if (atualError) return res.status(500).json({ error: atualError.message })
  if (!atual) return res.status(404).json({ error: 'Ajuste não encontrado' })

  const alteracoes = {}
  if (req.body?.pontos !== undefined) {
    const pontos = lerPontos(req.body.pontos)
    if (pontos.error) return res.status(400).json({ error: pontos.error })
    if (pontos.pontos !== Number(atual.pontos)) alteracoes.pontos = pontos.pontos
  }
  if (req.body?.motivo !== undefined) {
    const motivo = lerMotivo(req.body.motivo)
    if (motivo.error) return res.status(400).json({ error: motivo.error })
    if (motivo.motivo !== atual.motivo) alteracoes.motivo = motivo.motivo
  }
  // Nada mudou de verdade: não grava, para o histórico não ganhar uma edição vazia
  if (Object.keys(alteracoes).length === 0) return res.json(atual)

  const { data, error } = await supabase
    .from('ajustes_pontos')
    .update({ ...alteracoes, atualizado_por: req.user.id, atualizado_em: new Date().toISOString() })
    .eq('id', req.params.id)
    .is('excluido_em', null)
    .select(CAMPOS_AJUSTE)
    .maybeSingle()

  if (error) return res.status(400).json({ error: error.message })
  if (!data) return res.status(404).json({ error: 'Ajuste não encontrado' })
  return res.json(data)
}

exports.excluir = async (req, res) => {
  if (!UUID_REGEX.test(req.params.id)) return res.status(404).json({ error: 'Ajuste não encontrado' })

  const { data, error } = await supabase
    .from('ajustes_pontos')
    .update({ excluido_por: req.user.id, excluido_em: new Date().toISOString() })
    .eq('id', req.params.id)
    .is('excluido_em', null)
    .select('id')
    .maybeSingle()

  if (error) return res.status(400).json({ error: error.message })
  if (!data) return res.status(404).json({ error: 'Ajuste não encontrado' })
  return res.status(204).send()
}
