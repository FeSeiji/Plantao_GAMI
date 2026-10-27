// Contas do BM Financeiro no backend, as mesmas da tela (Frontend/components/bm/calculos.ts e
// app/(app)/bm-financeiro/page.tsx), com os mesmos arredondamentos e na mesma ordem. A tela refaz as contas do mês
// a cada valor digitado; aqui elas servem para a conta corrente em cascata (a diferença final de um mês é a
// "dif. mês anterior" do seguinte) e para o Excel. Mudou uma conta lá, muda aqui também.

// G108: a produtividade de cada funcionária é 0,1% do faturamento
const PERCENTUAL_PRODUTIVIDADE = 0.001
// R127: parte do resultado que é distribuída aos sócios
const FATOR_DISTRIBUICAO = 0.63
// Primeiro mês da conta corrente no sistema: a diferença do mês anterior dele é o saldo inicial digitado
const MES_INICIAL_CONTA_CORRENTE = '2026-11'

// Previsão de impostos trimestrais (N115 a R120 da planilha), por empresa. A PMP calcula CSLL e IRPJ sobre o
// faturamento "por dentro" (× 100 ÷ (100 − 4,65 − 1,5)); a GAMI, sobre recibos + casos fora com recibo. O
// adicional de IRPJ é 10% do que passar de R$ 20.000 em 32% do faturamento — a planilha não tinha o MAX(0) e,
// abaixo disso, dava um valor negativo. PIS e Cofins estão com alíquota zero na planilha
const IMPOSTOS = {
  pmp: { csll: 0.0188, irpj: 0.033, porDentro: true },
  gami: { csll: 0.0288, irpj: 0.048, porDentro: false },
}

// Linhas digitadas da conta corrente, por sócio
const CAMPOS_CONTA_CORRENTE = ['darf', 'pro_labore', 'distr_dia_05', 'distr_dia_10']
const CAMPOS_BANCOS = ['bradesco_dia_05', 'itau_dia_05', 'bradesco_dia_10', 'itau_dia_10', 'cef']

const arredondar = n => Math.round(n * 100) / 100

// As "fórmulas" da planilha: somas por coluna e porcentagens. PorSocio = { id: valor }
function somar(linhas, ids) {
  return Object.fromEntries(ids.map(id => [id, arredondar(linhas.reduce((t, l) => t + (l[id] ?? 0), 0))]))
}

function multiplicar(linha, fator) {
  const f = typeof fator === 'number' ? () => fator : fator
  return Object.fromEntries(Object.entries(linha).map(([id, v]) => [id, arredondar(v * f(id))]))
}

const somarTudo = linha => arredondar(Object.values(linha).reduce((t, v) => t + v, 0))

function calcularImpostos(empresa, faturamento) {
  const { csll, irpj, porDentro } = IMPOSTOS[empresa]
  const base = porDentro ? (faturamento * 100) / (100 - 4.65 - 1.5) : faturamento
  const adicional = Math.max(0, faturamento * 0.32 - 20000) * 0.1
  const valorCsll = arredondar(base * csll)
  const valorIrpj = arredondar(base * irpj + adicional)
  return { csll: valorCsll, irpj: valorIrpj, total: arredondar(valorCsll + valorIrpj) }
}

// Casos fora com recibo (linhas 8 a 57): o total de cada bloco, a parte do médico e as custas, e a prévia
// dos sócios (GAMI PRO sem recibo + custas), que é a "distribuição CF" da conta corrente
function calcularCasosFora(bm, fin) {
  const ids = bm.socios.map(s => s.id)
  const bloco = (casos, medico, custas) => {
    const total = somar(casos.map(c => c.partes), ids)
    return { total, medico: multiplicar(total, medico), custas: multiplicar(total, custas) }
  }
  const escalado = bloco(bm.casosForaRecibo.filter(c => c.escalado), 0.5, 0.5)
  const naoEscalado = bloco(bm.casosForaRecibo.filter(c => !c.escalado), 0.8, 0.2)
  const gamiPro = Object.fromEntries(
    ids.filter(id => fin.socios[id]?.gami_pro_sem_recibo != null).map(id => [id, fin.socios[id].gami_pro_sem_recibo])
  )
  const custas = somar([escalado.custas, naoEscalado.custas], ids)
  return {
    previa: somar([gamiPro, custas], ids),
    medico: somar([escalado.medico, naoEscalado.medico], ids),
    casosForaRecibo100: arredondar(somarTudo(escalado.total) + somarTudo(naoEscalado.total)),
    custasCasosFora: somarTudo(custas),
  }
}

// Valor do plantão de cada categoria: o do mês ou, se vazio, o do último mês preenchido
function valoresPlantao(fin) {
  const campo = { diurno: 'valor_diurno', noturno: 'valor_noturno', diurno_fds: 'valor_diurno_fds', noturno_fds: 'valor_noturno_fds' }
  return Object.fromEntries(Object.entries(campo).map(([cat, c]) => [cat, fin[c] ?? fin.valores_plantao_anteriores[c]]))
}

function pagamentoPlantonista(p, valores) {
  return arredondar(Object.keys(valores).reduce((t, cat) => t + p.categorias[cat] * (valores[cat] ?? 0), 0))
}

// Faturamento, despesas e rateio (calcularFinanceiro de calculos.ts)
function calcularFinanceiro(fin, { casosForaRecibo100, custasCasosFora, plantonistas }) {
  const gamiProSemRecibo = arredondar(Object.values(fin.socios).reduce((t, s) => t + (s.gami_pro_sem_recibo ?? 0), 0))
  const produtividade = {
    pmp: arredondar((fin.faturamento_pmp ?? 0) * PERCENTUAL_PRODUTIVIDADE),
    gami: arredondar((gamiProSemRecibo + (fin.gami_total ?? 0) + casosForaRecibo100) * PERCENTUAL_PRODUTIVIDADE),
  }
  const impostos = {
    pmp: calcularImpostos('pmp', fin.faturamento_pmp ?? 0),
    gami: calcularImpostos('gami', (fin.recibos_gami ?? 0) + casosForaRecibo100),
  }
  const valores = valoresPlantao(fin)
  const totalPlantonistas = arredondar(plantonistas.reduce((t, p) => t + pagamentoPlantonista(p, valores), 0))

  const valorDespesa = d =>
    d.calculo === 'produtividade' ? produtividade[d.empresa]
      : d.calculo === 'plantonistas' ? totalPlantonistas
        : d.calculo === 'impostos' ? impostos[d.empresa].total
          : d.valor ?? 0

  const totalDespesas = { pmp: 0, gami: 0 }
  for (const d of fin.despesas) totalDespesas[d.empresa] = arredondar(totalDespesas[d.empresa] + valorDespesa(d))

  const faturamentoGeral = arredondar((fin.gami_total ?? 0) + custasCasosFora + (fin.faturamento_pmp ?? 0))
  const valorParaDistribuir = arredondar((faturamentoGeral - totalDespesas.pmp - totalDespesas.gami) * FATOR_DISTRIBUICAO)

  return { produtividade, impostos, totalPlantonistas, valorDespesa, totalDespesas, faturamentoGeral, valorParaDistribuir }
}

// Pontos (linhas 133 a 174): TOTAL de cada sócio, valor do ponto e previsão (montarPontos da tela)
function calcularPontos(bm, fin, valorParaDistribuir) {
  const ids = bm.socios.map(s => s.id)
  const fator = id => fin.socios[id]?.fator_correcao ?? 1
  const doAjuste = a => ({ [a.medico.id]: a.pontos })
  const somaDoTipo = tipo => somar(bm.ajustes.filter(a => a.tipo === tipo).map(doAjuste), ids)

  const corrigido = multiplicar(Object.fromEntries(bm.socios.map(s => [s.id, s.valor_escala])), fator)
  const totSubstituido = multiplicar(
    somar([
      ...bm.substituicoes.map(s => s.pontos),
      somaDoTipo('administrativo'),
      somaDoTipo('reuniao'),
      ...bm.ajustes.filter(a => a.tipo === 'outro').map(doAjuste),
    ], ids),
    fator
  )
  const total = somar([corrigido, totSubstituido], ids)
  const pontosDistribuidos = somarTudo(total)
  const valorDoPonto = pontosDistribuidos > 0 ? valorParaDistribuir / pontosDistribuidos : 0
  return { total, pontosDistribuidos, valorDoPonto, previsao: multiplicar(total, valorDoPonto) }
}

// Conta corrente (linhas 174 a 197). difAnterior: a diferença final do mês anterior de cada sócio (no primeiro
// mês, o saldo inicial). A diferença final deste mês é a dif. mês anterior do próximo
function calcularContaCorrente(bm, fin, { previsao, previa, medico, difAnterior }) {
  const ids = bm.socios.map(s => s.id)
  const campo = c => Object.fromEntries(ids.filter(id => fin.socios[id]?.[c] != null).map(id => [id, fin.socios[id][c]]))
  const [darf, proLabore, distrDia05, distrDia10] = CAMPOS_CONTA_CORRENTE.map(campo)

  const prevAtualizada = somar([previsao, difAnterior, darf], ids)
  const distrTotal = somar([previa, proLabore, distrDia05, distrDia10], ids)
  const totalADistribuir = somar([distrDia05, distrDia10], ids)
  const bancos = somar(CAMPOS_BANCOS.map(campo), ids)
  return {
    prevAtualizada,
    distrTotal,
    diferencaFinal: Object.fromEntries(ids.map(id => [id, arredondar(prevAtualizada[id] - distrTotal[id])])),
    proECf: somar([distrTotal, medico], ids),
    totalADistribuir,
    balanco: Object.fromEntries(ids.map(id => [id, arredondar(totalADistribuir[id] - bancos[id])])),
  }
}

// O saldo inicial digitado no primeiro mês da conta corrente
function saldoInicial(bm) {
  return Object.fromEntries(
    Object.entries(bm.financeiro.socios).filter(([, s]) => s.saldo_inicial != null).map(([id, s]) => [id, s.saldo_inicial])
  )
}

// Todas as contas do mês. difAnterior: a diferença final do mês anterior (no primeiro mês, use saldoInicial)
function calcularMes(bm, difAnterior = {}) {
  const fin = bm.financeiro
  const casosFora = calcularCasosFora(bm, fin)
  const financeiro = calcularFinanceiro(fin, { ...casosFora, plantonistas: bm.plantonistas })
  const pontos = calcularPontos(bm, fin, financeiro.valorParaDistribuir)
  const contaCorrente = calcularContaCorrente(bm, fin, { ...casosFora, previsao: pontos.previsao, difAnterior })
  return { casosFora, financeiro, pontos, contaCorrente }
}

// 'AAAA-MM' do mês seguinte
function mesSeguinte(mes) {
  const [ano, m] = mes.split('-').map(Number)
  return m === 12 ? `${ano + 1}-01` : `${ano}-${String(m + 1).padStart(2, '0')}`
}

module.exports = {
  MES_INICIAL_CONTA_CORRENTE,
  CAMPOS_CONTA_CORRENTE,
  CAMPOS_BANCOS,
  calcularImpostos,
  calcularMes,
  saldoInicial,
  mesSeguinte,
}
