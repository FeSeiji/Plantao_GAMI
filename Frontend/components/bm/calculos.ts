// Contas do BM Financeiro, as mesmas da planilha do cliente (BM DEZ 26.xlsx). Tudo é refeito na tela a cada
// valor digitado; o backend guarda o que foi digitado (Backend/src/services/financeiroBm.js) e refaz as mesmas
// contas em Backend/src/services/calculoBm.js para a conta corrente em cascata e o Excel. Mudou uma conta aqui,
// muda lá também.

// G108: a produtividade de cada funcionária é 0,1% do faturamento
export const PERCENTUAL_PRODUTIVIDADE = 0.001
// R127: parte do resultado que é distribuída aos sócios
export const FATOR_DISTRIBUICAO = 0.63

// Previsão de impostos trimestrais (N115 a R120 da planilha). A PMP calcula CSLL e IRPJ sobre o faturamento
// "por dentro" (× 100 ÷ (100 − 4,65 − 1,5)); a GAMI, sobre recibos + casos fora. O adicional de IRPJ
// é 10% do que passar de R$ 20.000 em 32% do faturamento (nunca negativo)
const IMPOSTOS = {
  pmp: { csll: 0.0188, irpj: 0.033, porDentro: true },
  gami: { csll: 0.0288, irpj: 0.048, porDentro: false },
}

export type Impostos = { csll: number; irpj: number; total: number }

export function calcularImpostos(empresa: Empresa, faturamento: number): Impostos {
  const { csll, irpj, porDentro } = IMPOSTOS[empresa]
  const base = porDentro ? (faturamento * 100) / (100 - 4.65 - 1.5) : faturamento
  const adicional = Math.max(0, faturamento * 0.32 - 20000) * 0.1
  const valorCsll = arredondar(base * csll)
  const valorIrpj = arredondar(base * irpj + adicional)
  return { csll: valorCsll, irpj: valorIrpj, total: arredondar(valorCsll + valorIrpj) }
}

export const CATEGORIAS_PLANTAO = [
  { chave: "diurno", rotulo: "Diurno", campo: "valor_diurno" },
  { chave: "noturno", rotulo: "Noturno", campo: "valor_noturno" },
  { chave: "diurno_fds", rotulo: "Diurno fim de semana", campo: "valor_diurno_fds" },
  { chave: "noturno_fds", rotulo: "Noturno fim de semana", campo: "valor_noturno_fds" },
] as const

export type CategoriaPlantao = (typeof CATEGORIAS_PLANTAO)[number]["chave"]
export type CampoValorPlantao = (typeof CATEGORIAS_PLANTAO)[number]["campo"]
export type CampoFaturamento = "faturamento_pmp" | "recibos_gami" | "gami_total"
export type CampoMes = CampoFaturamento | CampoValorPlantao

export type Empresa = "pmp" | "gami"

// Uma despesa do mês: o item da lista e o que foi digitado nele.
// calculo: produtividade (0,1% do faturamento), plantonistas (plantões × valor) ou impostos; vazio = digitado
export type Despesa = {
  id: string
  empresa: Empresa
  nome: string
  ordem: number
  calculo: "produtividade" | "plantonistas" | "impostos" | null
  ativo: boolean
  banco: string | null
  data_pago: string | null
  valor: number | null
}

// Valores em reais digitados por sócio: GAMI PRO sem recibo e a conta corrente (o saldo inicial só existe no
// primeiro mês dela)
export const CAMPOS_SOCIO_DINHEIRO = [
  "gami_pro_sem_recibo",
  "saldo_inicial",
  "darf",
  "pro_labore",
  "distr_dia_05",
  "distr_dia_10",
  "bradesco_dia_05",
  "itau_dia_05",
  "bradesco_dia_10",
  "itau_dia_10",
  "cef",
] as const
export type CampoSocioDinheiro = (typeof CAMPOS_SOCIO_DINHEIRO)[number]

export type SocioFinanceiro = Record<CampoSocioDinheiro, number | null> & { fator_correcao: number }

export const socioVazio = (): SocioFinanceiro => ({
  ...(Object.fromEntries(CAMPOS_SOCIO_DINHEIRO.map((c) => [c, null])) as Record<CampoSocioDinheiro, number | null>),
  fator_correcao: 1,
})

// O que vem do backend em bm.financeiro. conta_corrente.desde: primeiro mês da conta corrente ('AAAA-MM');
// dif_mes_anterior: a diferença final do mês anterior de cada sócio (vazia no primeiro mês e antes dele)
export type Financeiro = Record<CampoMes, number | null> & {
  valores_plantao_anteriores: Record<CampoValorPlantao, number | null>
  socios: Record<string, SocioFinanceiro>
  despesas: Despesa[]
  conta_corrente: { desde: string; dif_mes_anterior: Record<string, number> | null }
}

// O que foi editado na tela e ainda não foi salvo, no mesmo formato do PUT /bm-financeiro/financeiro
export type Edicoes = {
  mes: Partial<Record<CampoMes, number | null>>
  socios: Record<string, Partial<SocioFinanceiro>>
  despesas: Record<string, Partial<Pick<Despesa, "banco" | "data_pago" | "valor">>>
}

export const edicoesVazias = (): Edicoes => ({ mes: {}, socios: {}, despesas: {} })

export const temEdicoes = (e: Edicoes) =>
  Object.keys(e.mes).length > 0 || Object.keys(e.socios).length > 0 || Object.keys(e.despesas).length > 0

// O financeiro como está na tela: o gravado com as edições por cima
export function aplicarEdicoes(f: Financeiro, e: Edicoes): Financeiro {
  const socios = { ...f.socios }
  for (const [id, campos] of Object.entries(e.socios)) {
    const gravado: SocioFinanceiro = socios[id] ?? socioVazio()
    socios[id] = { ...gravado, ...campos }
  }
  return {
    ...f,
    ...e.mes,
    socios,
    despesas: f.despesas.map((d) => ({ ...d, ...e.despesas[d.id] })),
  }
}

type Plantonista = { id: string; categorias: Record<CategoriaPlantao, number> }

// Valor do plantão de cada categoria: o do mês ou, se vazio, o do último mês preenchido
export function valoresPlantao(f: Financeiro): Record<CategoriaPlantao, number | null> {
  return Object.fromEntries(
    CATEGORIAS_PLANTAO.map((c) => [c.chave, f[c.campo] ?? f.valores_plantao_anteriores[c.campo]]),
  ) as Record<CategoriaPlantao, number | null>
}

// Quanto cada plantonista recebe no mês: plantões de cada categoria × valor da categoria
export function pagamentoPlantonista(p: Plantonista, valores: Record<CategoriaPlantao, number | null>) {
  return arredondar(CATEGORIAS_PLANTAO.reduce((t, c) => t + p.categorias[c.chave] * (valores[c.chave] ?? 0), 0))
}

export type ResultadoFinanceiro = {
  gamiProSemRecibo: number // soma da linha 2 (Q110)
  casosFora100: number // R122: 100% dos casos fora
  custasCasosFora: number // R124: a parte da casa nos casos fora, que entra no rateio
  produtividade: Record<Empresa, number> // F106 e L106: de cada funcionária, em cada empresa
  impostos: Record<Empresa, Impostos> // Q117 a R120: previsão de CSLL e IRPJ
  totalPlantonistas: number
  valorDespesa: (d: Despesa) => number
  totalDespesas: Record<Empresa, number> // F126 e L126
  faturamentoGeral: number // R126
  valorParaDistribuir: number // R128
}

// casosFora100 e custasCasosFora vêm da grade dos casos fora (R122 e R124 da planilha)
export function calcularFinanceiro(
  f: Financeiro,
  { casosFora100, custasCasosFora, plantonistas }: { casosFora100: number; custasCasosFora: number; plantonistas: Plantonista[] },
): ResultadoFinanceiro {
  const gamiProSemRecibo = arredondar(Object.values(f.socios).reduce((t, s) => t + (s.gami_pro_sem_recibo ?? 0), 0))
  const produtividade = {
    pmp: arredondar((f.faturamento_pmp ?? 0) * PERCENTUAL_PRODUTIVIDADE),
    gami: arredondar((gamiProSemRecibo + (f.gami_total ?? 0) + casosFora100) * PERCENTUAL_PRODUTIVIDADE),
  }
  const impostos = {
    pmp: calcularImpostos("pmp", f.faturamento_pmp ?? 0),
    gami: calcularImpostos("gami", (f.recibos_gami ?? 0) + casosFora100),
  }
  const valores = valoresPlantao(f)
  const totalPlantonistas = arredondar(plantonistas.reduce((t, p) => t + pagamentoPlantonista(p, valores), 0))

  const valorDespesa = (d: Despesa) =>
    d.calculo === "produtividade"
      ? produtividade[d.empresa]
      : d.calculo === "plantonistas"
        ? totalPlantonistas
        : d.calculo === "impostos"
          ? impostos[d.empresa].total
          : d.valor ?? 0

  const totalDespesas = { pmp: 0, gami: 0 }
  for (const d of f.despesas) totalDespesas[d.empresa] = arredondar(totalDespesas[d.empresa] + valorDespesa(d))

  const faturamentoGeral = arredondar((f.gami_total ?? 0) + custasCasosFora + (f.faturamento_pmp ?? 0))
  const valorParaDistribuir = arredondar((faturamentoGeral - totalDespesas.pmp - totalDespesas.gami) * FATOR_DISTRIBUICAO)

  return {
    gamiProSemRecibo,
    casosFora100,
    custasCasosFora,
    produtividade,
    impostos,
    totalPlantonistas,
    valorDespesa,
    totalDespesas,
    faturamentoGeral,
    valorParaDistribuir,
  }
}

export const arredondar = (n: number) => Math.round(n * 100) / 100

export function formatarDinheiro(valor: number | null | undefined) {
  if (valor == null) return ""
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// "1.234,56", "1234,56", "1234.56" ou "1.500" -> número; "" -> null; texto que não é número -> undefined
export function interpretarNumero(texto: string): number | null | undefined {
  const limpo = texto.replace(/R\$|\s/g, "")
  if (limpo === "") return null
  let normalizado = limpo
  if (limpo.includes(",")) normalizado = limpo.replace(/\./g, "").replace(",", ".")
  // Sem vírgula: um ponto seguido de 1 ou 2 dígitos é decimal; senão os pontos separam milhares
  else if (!/^-?\d+\.\d{1,2}$/.test(limpo)) normalizado = limpo.replace(/\./g, "")
  if (!/^-?\d+(\.\d+)?$/.test(normalizado)) return undefined
  return Number(normalizado)
}
