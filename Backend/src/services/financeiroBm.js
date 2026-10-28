const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const { buscarCargosDosUsuarios, contaComoSocio } = require('./usuarios')
const { MES_INICIAL_CONTA_CORRENTE } = require('./calculoBm')
const { buscarEmPaginas } = require('./paginas')

// Financeiro do BM (migrations bm_financeiro e bm_conta_corrente): os valores digitados por quem tem acesso ao BM.
// Só guarda o que foi digitado; as contas são feitas na tela e, para a conta corrente e o Excel, em calculoBm.js.

const CAMPOS_FATURAMENTO = ['faturamento_pmp', 'recibos_gami', 'gami_total']
// Valor do plantão de cada categoria e da hora do plantão extra: vazio no mês, vale o do último mês preenchido
const CAMPOS_VALOR_PLANTAO = ['valor_diurno', 'valor_noturno', 'valor_diurno_fds', 'valor_noturno_fds', 'valor_hora_extra']
const CAMPOS_MES = [...CAMPOS_FATURAMENTO, ...CAMPOS_VALOR_PLANTAO]
// Valores em reais de cada sócio no mês: GAMI PRO sem recibo, a conta corrente e os bancos da distribuição.
// O saldo inicial só existe no primeiro mês da conta corrente
const CAMPOS_SOCIO_DINHEIRO = [
  'gami_pro_sem_recibo', 'saldo_inicial', 'darf', 'pro_labore', 'distr_dia_05', 'distr_dia_10',
  'bradesco_dia_05', 'itau_dia_05', 'bradesco_dia_10', 'itau_dia_10', 'cef',
]
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Colunas de controle, que não aparecem como mudança no histórico
const CAMPOS_CONTROLE = ['mes', 'usuario_id', 'item_id', 'id', 'atualizado_por', 'atualizado_em']

// mes: 'AAAA-MM'. Retorna os valores digitados do mês, a lista de despesas com o valor de cada item,
// os valores de plantão do último mês em que foram preenchidos (valem enquanto o mês não tiver os seus)
// e o histórico do mês, do mais recente para o mais antigo
async function buscarFinanceiro(mes) {
  return (await buscarFinanceiroDosMeses([mes], { comHistorico: true })).get(mes)
}

// O financeiro de vários meses ('AAAA-MM', em ordem) com uma consulta por tabela: é o que a conta corrente em
// cascata usa para refazer os meses anteriores. Sem comHistorico, o histórico vem vazio. Map mes -> financeiro
async function buscarFinanceiroDosMeses(meses, { comHistorico = false } = {}) {
  const inicios = meses.map(m => `${m}-01`)
  const [primeiro, ultimo] = [inicios[0], inicios[inicios.length - 1]]
  const [todosOsMeses, socios, itens, despesas, historico] = await Promise.all([
    // Os meses anteriores também: o valor do plantão vazio vale o do último mês preenchido
    buscarEmPaginas(() => supabase.from('bm_meses').select(`mes, ${CAMPOS_MES.join(', ')}`).lte('mes', ultimo).order('mes', { ascending: false })),
    buscarEmPaginas(() =>
      supabase.from('bm_socios_mes').select(`mes, usuario_id, fator_correcao, ${CAMPOS_SOCIO_DINHEIRO.join(', ')}`)
        .gte('mes', primeiro).lte('mes', ultimo).order('mes').order('usuario_id')
    ),
    supabase.from('bm_despesa_itens').select('id, empresa, nome, ordem, calculo, ativo').order('ordem'),
    buscarEmPaginas(() =>
      supabase.from('bm_despesas').select('mes, item_id, banco, data_pago, valor').gte('mes', primeiro).lte('mes', ultimo).order('mes').order('item_id')
    ),
    comHistorico
      ? supabase
        .from('bm_historico')
        .select('id, tabela, antes, depois, feito_por, feito_em')
        .or(`mes.eq.${primeiro},mes.is.null`)
        .order('feito_em', { ascending: false })
        .limit(300)
      : { data: [], error: null },
  ])
  for (const r of [itens, historico]) if (r.error) throw r.error

  return new Map(meses.map((mes, i) => {
    const inicio = inicios[i]
    const atual = todosOsMeses.find(m => m.mes === inicio)
    // Até 24 meses para trás, do mais recente para o mais antigo
    const anteriores = todosOsMeses.filter(m => m.mes < inicio).slice(0, 24)
    const valoresAnteriores = {}
    for (const campo of CAMPOS_VALOR_PLANTAO) {
      const mesComValor = anteriores.find(m => m[campo] != null)
      valoresAnteriores[campo] = mesComValor ? Number(mesComValor[campo]) : null
    }

    const despesaDoItem = new Map(despesas.filter(d => d.mes === inicio).map(d => [d.item_id, d]))
    // Item desativado só aparece no mês que já tem valor nele
    const itensDoMes = itens.data.filter(item => item.ativo || despesaDoItem.has(item.id))

    return [mes, {
      ...Object.fromEntries(CAMPOS_MES.map(c => [c, numeroOuNulo(atual?.[c])])),
      valores_plantao_anteriores: valoresAnteriores,
      socios: Object.fromEntries(
        socios.filter(s => s.mes === inicio).map(s => [s.usuario_id, {
          ...Object.fromEntries(CAMPOS_SOCIO_DINHEIRO.map(c => [c, numeroOuNulo(s[c])])),
          fator_correcao: Number(s.fator_correcao),
        }])
      ),
      despesas: itensDoMes.map(item => {
        const d = despesaDoItem.get(item.id)
        return { ...item, banco: d?.banco ?? null, data_pago: d?.data_pago ?? null, valor: numeroOuNulo(d?.valor) }
      }),
      historico: historico.data.map(h => descreverEvento(h, itens.data)).filter(h => h.mudancas.length > 0),
    }]
  }))
}

// Uma linha do histórico com só o que mudou ({ campo, antes, depois }) e a quem ela se refere
function descreverEvento(evento, itens) {
  const { antes, depois } = evento
  const mudancas = Object.keys(depois)
    .filter(campo => !CAMPOS_CONTROLE.includes(campo))
    .filter(campo => String(antes?.[campo] ?? '') !== String(depois[campo] ?? ''))
    // Linha nova: o fator padrão (1) não conta como mudança
    .filter(campo => antes || !(campo === 'fator_correcao' && Number(depois[campo]) === 1))
    .map(campo => ({ campo, antes: antes?.[campo] ?? null, depois: depois[campo] ?? null }))

  const item = itens.find(i => i.id === (depois.item_id ?? depois.id))
  return {
    id: evento.id,
    tabela: evento.tabela,
    feito_por: evento.feito_por,
    feito_em: evento.feito_em,
    criado: !antes,
    usuario_id: depois.usuario_id ?? null,
    item: evento.tabela === 'bm_despesas' || evento.tabela === 'bm_despesa_itens'
      ? { id: item?.id ?? null, nome: item?.nome ?? null, empresa: item?.empresa ?? null }
      : null,
    mudancas,
  }
}

// Corpo: { mes: { campo: valor }, socios: { usuario_id: { campo: valor } }, despesas: { item_id: { banco, data_pago, valor } } }
// Só grava o que mudou de verdade, para o histórico não ganhar linhas vazias. Retorna { error } ou {}
async function salvarFinanceiro(mes, corpo, usuarioId) {
  const inicio = `${mes}-01`
  const agora = new Date().toISOString()

  const valoresMes = {}
  for (const [campo, valor] of Object.entries(corpo?.mes ?? {})) {
    if (!CAMPOS_MES.includes(campo)) return { error: `Campo desconhecido: ${campo}` }
    const lido = lerDinheiro(valor)
    if (lido.error) return lido
    valoresMes[campo] = lido.valor
  }

  const valoresSocios = {}
  const sociosEnviados = Object.entries(corpo?.socios ?? {})
  if (sociosEnviados.length > 0) {
    const cargos = await buscarCargosDosUsuarios()
    for (const [id, enviado] of sociosEnviados) {
      if (!UUID_REGEX.test(id) || !contaComoSocio(cargos.get(id)?.roles)) return { error: 'Sócio não encontrado' }
      const campos = enviado ?? {}
      valoresSocios[id] = {}
      for (const [campo, valor] of Object.entries(campos)) {
        if (campo === 'fator_correcao') continue
        if (!CAMPOS_SOCIO_DINHEIRO.includes(campo)) return { error: `Campo desconhecido: ${campo}` }
        if (campo === 'saldo_inicial' && mes !== MES_INICIAL_CONTA_CORRENTE) {
          return { error: 'O saldo inicial só é digitado no primeiro mês da conta corrente' }
        }
        const lido = lerDinheiro(valor)
        if (lido.error) return lido
        valoresSocios[id][campo] = lido.valor
      }
      if (campos.fator_correcao !== undefined) {
        const fator = campos.fator_correcao
        if (typeof fator !== 'number' || !Number.isFinite(fator) || fator <= 0 || fator > 10) {
          return { error: 'O fator de correção deve ser maior que zero e no máximo 10' }
        }
        valoresSocios[id].fator_correcao = Math.round(fator * 10000) / 10000
      }
    }
  }

  const valoresDespesas = {}
  const despesasEnviadas = Object.entries(corpo?.despesas ?? {})
  if (despesasEnviadas.length > 0) {
    const ids = despesasEnviadas.map(([id]) => id)
    if (!ids.every(id => UUID_REGEX.test(id))) return { error: 'Despesa não encontrada' }
    const { data: itens, error } = await supabase.from('bm_despesa_itens').select('id, nome, calculo').in('id', ids)
    if (error) throw error
    for (const [id, enviado] of despesasEnviadas) {
      const item = itens.find(i => i.id === id)
      if (!item) return { error: 'Despesa não encontrada' }
      const campos = enviado ?? {}
      valoresDespesas[id] = {}
      if (campos.valor !== undefined) {
        if (item.calculo) return { error: `${item.nome} é calculado pelo sistema` }
        const lido = lerDinheiro(campos.valor)
        if (lido.error) return lido
        valoresDespesas[id].valor = lido.valor
      }
      if (campos.banco !== undefined) {
        const banco = campos.banco === null ? '' : String(campos.banco).trim().slice(0, 60)
        valoresDespesas[id].banco = banco || null
      }
      if (campos.data_pago !== undefined) {
        if (campos.data_pago !== null && !dataValida(campos.data_pago)) return { error: 'Data de pagamento inválida' }
        valoresDespesas[id].data_pago = campos.data_pago
      }
    }
  }

  // Compara com o que está gravado e manda só as linhas que mudaram
  const [atualMes, atuaisSocios, atuaisDespesas] = await Promise.all([
    supabase.from('bm_meses').select('*').eq('mes', inicio).maybeSingle(),
    supabase.from('bm_socios_mes').select('*').eq('mes', inicio),
    supabase.from('bm_despesas').select('*').eq('mes', inicio),
  ])
  for (const r of [atualMes, atuaisSocios, atuaisDespesas]) if (r.error) throw r.error

  const mudou = (atual, novos) => Object.entries(novos).some(([c, v]) => String(atual?.[c] ?? '') !== String(v ?? ''))
  const linha = (atual, novos, chave) => ({ ...semControle(atual), ...novos, ...chave, atualizado_por: usuarioId, atualizado_em: agora })

  // Grava em até três etapas (mês, sócios, despesas), sem transação entre elas. Se uma falhar depois de outra já
  // gravada, salvar de novo completa: só o que ainda difere do banco é enviado
  let gravouAlgo = false
  const gravar = async (tabela, linhas) => {
    const { error } = await supabase.from(tabela).upsert(linhas)
    if (error) {
      console.error(error)
      throw new Error(gravouAlgo
        ? 'Parte dos valores foi salva, mas não tudo. Clique em Salvar de novo para completar.'
        : `Não foi possível salvar: ${error.message}`)
    }
    gravouAlgo = true
  }

  if (mudou(atualMes.data, valoresMes)) await gravar('bm_meses', linha(atualMes.data, valoresMes, { mes: inicio }))

  const sociosMudados = Object.entries(valoresSocios)
    .map(([id, novos]) => [atuaisSocios.data.find(s => s.usuario_id === id), novos, id])
    .filter(([atual, novos]) => mudou(atual, novos))
    .map(([atual, novos, id]) => linha(atual, novos, { mes: inicio, usuario_id: id }))
  if (sociosMudados.length > 0) await gravar('bm_socios_mes', sociosMudados)

  const despesasMudadas = Object.entries(valoresDespesas)
    .map(([id, novos]) => [atuaisDespesas.data.find(d => d.item_id === id), novos, id])
    .filter(([atual, novos]) => mudou(atual, novos))
    .map(([atual, novos, id]) => linha(atual, novos, { mes: inicio, item_id: id }))
  if (despesasMudadas.length > 0) await gravar('bm_despesas', despesasMudadas)

  return {}
}

// Linha gravada sem as colunas de controle (elas são preenchidas de novo a cada gravação)
function semControle(linha) {
  if (!linha) return {}
  const { atualizado_por, atualizado_em, ...resto } = linha
  return resto
}

// Valor em reais: número com duas casas, ou null para apagar
function lerDinheiro(valor) {
  if (valor === null) return { valor: null }
  if (typeof valor !== 'number' || !Number.isFinite(valor) || Math.abs(valor) >= 1e10) {
    return { error: 'Informe os valores como número' }
  }
  return { valor: Math.round(valor * 100) / 100 }
}

function dataValida(texto) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false
  const d = new Date(`${texto}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === texto
}

const numeroOuNulo = v => (v == null ? null : Number(v))

// Itens de despesa: o escritório inclui um item novo no fim da lista da empresa
async function criarItemDespesa({ empresa, nome }, usuarioId) {
  if (!['pmp', 'gami'].includes(empresa)) return { error: 'Escolha a empresa: PMP ou GAMI' }
  const nomeLimpo = String(nome ?? '').trim().slice(0, 100)
  if (!nomeLimpo) return { error: 'Informe o nome da despesa' }

  const { data: ultimo, error: ultimoError } = await supabase
    .from('bm_despesa_itens')
    .select('ordem')
    .eq('empresa', empresa)
    .order('ordem', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (ultimoError) throw ultimoError

  const { data, error } = await supabase
    .from('bm_despesa_itens')
    .insert({ empresa, nome: nomeLimpo, ordem: (ultimo?.ordem ?? 0) + 1, atualizado_por: usuarioId })
    .select('id, empresa, nome, ordem, calculo, ativo')
    .single()
  if (error) throw error
  return { item: data }
}

// Renomear ou desativar (ativo: false) um item. Desativado, some dos meses que não têm valor nele
async function atualizarItemDespesa(id, { nome, ativo }, usuarioId) {
  if (!UUID_REGEX.test(id)) return { error: 'Despesa não encontrada', status: 404 }
  const alteracoes = {}
  if (nome !== undefined) {
    const nomeLimpo = String(nome ?? '').trim().slice(0, 100)
    if (!nomeLimpo) return { error: 'Informe o nome da despesa' }
    alteracoes.nome = nomeLimpo
  }
  if (ativo !== undefined) {
    if (typeof ativo !== 'boolean') return { error: 'ativo deve ser true ou false' }
    alteracoes.ativo = ativo
  }
  if (Object.keys(alteracoes).length === 0) return { error: 'Nada para alterar' }

  const { data, error } = await supabase
    .from('bm_despesa_itens')
    .update({ ...alteracoes, atualizado_por: usuarioId, atualizado_em: new Date().toISOString() })
    .eq('id', id)
    .select('id, empresa, nome, ordem, calculo, ativo')
    .maybeSingle()
  if (error) throw error
  if (!data) return { error: 'Despesa não encontrada', status: 404 }
  return { item: data }
}

module.exports = { buscarFinanceiro, buscarFinanceiroDosMeses, salvarFinanceiro, criarItemDespesa, atualizarItemDespesa }
