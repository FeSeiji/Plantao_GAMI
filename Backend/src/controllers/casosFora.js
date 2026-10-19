const { createClient } = require('@supabase/supabase-js')

const { ROLES_ANESTESISTA } = require('../services/usuarios')
const { listarCasosFora } = require('../services/casosFora')
const { ehGestao } = require('../middleware/auth')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Caso fora: cirurgia feita por um anestesista fora da escala (antigo Google Forms "Casos Fora - GAMI").
// Todos os usuários logados veem; edita e exclui quem criou ou a gestão (escritório, técnico e admin).
// gami aparece como "GAMI/ADDS" e sem_recibo como "Sem nota fiscal" (PMP e Pessoal saíram em 2026-10-19)
const RECIBOS = ['gami', 'sem_recibo']
const MAX_TEXTO = 200
const MAX_COMENTARIOS = 2000
const MAX_VALOR = 99999999.99

const DATA_REGEX = /^\d{4}-\d{2}-\d{2}$/

const podeEditar = (user, caso) => ehGestao(user) || caso.criado_por === user.id

exports.listar = async (req, res) => {
  const { inicio, fim, anestesista_id } = req.query

  try {
    const casos = await listarCasosFora({ inicio, fim, anestesista_id })
    return res.json(casos.map(c => ({ ...c, podeEditar: podeEditar(req.user, { criado_por: c.criadoPor?.id }) })))
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

exports.criar = async (req, res) => {
  let campos
  try {
    campos = await validarCampos(req.body)
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }

  const { data: caso, error } = await supabase
    .from('casos_fora')
    .insert({ ...campos, criado_por: req.user.id })
    .select('id')
    .single()

  if (error) return res.status(400).json({ error: error.message })
  return res.status(201).json({ id: caso.id })
}

exports.atualizar = async (req, res) => {
  const { data: atual, error: atualError } = await supabase
    .from('casos_fora')
    .select('id, criado_por, hospital_id, cirurgiao_id')
    .eq('id', req.params.id)
    .maybeSingle()

  if (atualError) return res.status(500).json({ error: atualError.message })
  if (!atual) return res.status(404).json({ error: 'Caso não encontrado' })
  if (!podeEditar(req.user, atual)) {
    return res.status(403).json({ error: 'Só quem criou o caso ou a gestão pode editá-lo' })
  }

  let campos
  try {
    campos = await validarCampos(req.body, atual)
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }

  const { error } = await supabase
    .from('casos_fora')
    .update({ ...campos, atualizado_por: req.user.id, atualizado_em: new Date().toISOString() })
    .eq('id', atual.id)

  if (error) return res.status(400).json({ error: error.message })
  return res.json({ id: atual.id })
}

exports.remover = async (req, res) => {
  const { data: caso, error: buscaError } = await supabase
    .from('casos_fora')
    .select('id, criado_por')
    .eq('id', req.params.id)
    .maybeSingle()

  if (buscaError) return res.status(500).json({ error: buscaError.message })
  if (!caso) return res.status(404).json({ error: 'Caso não encontrado' })
  if (!podeEditar(req.user, caso)) {
    return res.status(403).json({ error: 'Só quem criou o caso ou a gestão pode excluí-lo' })
  }

  const { error } = await supabase.from('casos_fora').delete().eq('id', caso.id)
  if (error) return res.status(400).json({ error: error.message })
  return res.status(204).send()
}

// atual: na edição, o caso pode continuar num hospital ou cirurgião que foi desativado depois
async function validarCampos(body, atual = {}) {
  const {
    data, anestesista_id, segundo_anestesista_id, escalado, cirurgiao, paciente_nome, paciente_cpf, cirurgia,
    hospital_id, recibo, valor, comentarios,
  } = body ?? {}

  if (!DATA_REGEX.test(data ?? '') || isNaN(new Date(`${data}T00:00:00Z`).getTime())) {
    throw new Error('data é obrigatória (AAAA-MM-DD)')
  }
  if (typeof escalado !== 'boolean') throw new Error('Informe se o anestesista estava escalado')

  const textos = {
    cirurgiao: textoObrigatorio(cirurgiao, 'Cirurgião'),
    paciente_nome: textoObrigatorio(paciente_nome, 'Nome do paciente'),
    cirurgia: textoObrigatorio(cirurgia, 'Cirurgia realizada'),
  }

  const cpf = String(paciente_cpf ?? '').replace(/\D/g, '')
  if (!cpfValido(cpf)) throw new Error('CPF do paciente inválido')

  if (recibo != null && !RECIBOS.includes(recibo)) throw new Error('recibo inválido')

  let valorNormalizado = null
  if (valor != null && valor !== '') {
    valorNormalizado = Number(String(valor).replace(',', '.'))
    if (!Number.isFinite(valorNormalizado) || valorNormalizado < 0 || valorNormalizado > MAX_VALOR) {
      throw new Error('Valor inválido')
    }
    valorNormalizado = Math.round(valorNormalizado * 100) / 100
  }

  if (hospital_id) {
    const { data: hospital, error } = await supabase
      .from('hospitais')
      .select('id, ativo')
      .eq('id', hospital_id)
      .maybeSingle()
    if (error) throw error
    if (!hospital) throw new Error('Hospital não encontrado')
    if (!hospital.ativo && hospital.id !== atual.hospital_id) throw new Error('Esse hospital foi desativado')
  }

  const cirurgiaoDaLista = await buscarCirurgiao(textos.cirurgiao, atual.cirurgiao_id)

  if (!anestesista_id) throw new Error('anestesista_id é obrigatório')
  await validarAnestesista(anestesista_id, 'O anestesista')
  // Segundo anestesista: opcional (o caso tem no máximo dois)
  if (segundo_anestesista_id) {
    if (segundo_anestesista_id === anestesista_id) throw new Error('Escolha dois anestesistas diferentes')
    await validarAnestesista(segundo_anestesista_id, 'O segundo anestesista')
  }

  return {
    data,
    anestesista_id,
    segundo_anestesista_id: segundo_anestesista_id || null,
    escalado,
    ...textos,
    // Nome da lista liga o caso ao cirurgião (e fica escrito como na lista); nome de fora fica só como texto
    cirurgiao: cirurgiaoDaLista?.nome ?? textos.cirurgiao,
    cirurgiao_id: cirurgiaoDaLista?.id ?? null,
    paciente_cpf: cpf,
    hospital_id: hospital_id || null,
    recibo: recibo ?? null,
    valor: valorNormalizado,
    comentarios: String(comentarios ?? '').trim().slice(0, MAX_COMENTARIOS) || null,
  }
}

async function validarAnestesista(id, rotulo) {
  const { data: auth, error } = await supabase.auth.admin.getUserById(id)
  if (error || !auth?.user) throw new Error(`${rotulo} não foi encontrado`)
  if (!(auth.user.app_metadata?.roles ?? []).some(r => ROLES_ANESTESISTA.includes(r))) {
    throw new Error(`${rotulo} precisa ser um médico (sócio ou plantonista)`)
  }
}

// Cirurgião da lista com o mesmo nome, sem diferenciar maiúsculas. Desativado só vale para o caso que já o usava.
// A lista é curta, então a comparação é feita aqui e não no banco.
async function buscarCirurgiao(nome, cirurgiaoAtual) {
  const { data, error } = await supabase.from('cirurgioes').select('id, nome, ativo')
  if (error) throw error
  const chave = nome.toLocaleLowerCase('pt-BR')
  return data.find(c => c.nome.toLocaleLowerCase('pt-BR') === chave && (c.ativo || c.id === cirurgiaoAtual)) ?? null
}

function textoObrigatorio(valor, rotulo) {
  const texto = String(valor ?? '').trim().slice(0, MAX_TEXTO)
  if (!texto) throw new Error(`${rotulo} é obrigatório`)
  return texto
}

// 11 dígitos, não todos iguais, e os dois dígitos verificadores batendo
function cpfValido(cpf) {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false
  const digito = tamanho => {
    let soma = 0
    for (let i = 0; i < tamanho; i++) soma += Number(cpf[i]) * (tamanho + 1 - i)
    const resto = (soma * 10) % 11
    return resto === 10 ? 0 : resto
  }
  return digito(9) === Number(cpf[9]) && digito(10) === Number(cpf[10])
}
