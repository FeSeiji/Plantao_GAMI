// Dias da semana em que o médico prefere trabalhar, no formato do Date.getDay() (0 = domingo).
// Ordem de exibição começa na segunda.
export const DIAS_SEMANA = [
  { valor: 1, curto: "Seg", plural: "às segundas" },
  { valor: 2, curto: "Ter", plural: "às terças" },
  { valor: 3, curto: "Qua", plural: "às quartas" },
  { valor: 4, curto: "Qui", plural: "às quintas" },
  { valor: 5, curto: "Sex", plural: "às sextas" },
  { valor: 6, curto: "Sáb", plural: "aos sábados" },
  { valor: 0, curto: "Dom", plural: "aos domingos" },
]

// null/undefined = não preencheu: disponível todos os dias.
// Plantões que viram a noite contam pelo dia em que começam.
export function foraDaDisponibilidade(dias: number[] | null | undefined, data: string | null | undefined) {
  if (!dias || !data) return false
  return !dias.includes(new Date(`${data}T00:00:00`).getDay())
}

// Aviso na lista de busca: o médico ainda pode ser adicionado, só fica sinalizado
export function AvisoIndisponivel({ dias, data }: { dias: number[] | null | undefined; data: string | null | undefined }) {
  if (!data || !foraDaDisponibilidade(dias, data)) return null
  const dia = DIAS_SEMANA.find((d) => d.valor === new Date(`${data}T00:00:00`).getDay())

  return (
    <span className="ml-auto shrink-0 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
      Prefere não trabalhar {dia?.plural}
    </span>
  )
}

// Férias ou congresso: bloqueia a escala nesses dias (datas AAAA-MM-DD, inclusivas)
export type Afastamento = {
  id: string
  tipo: "ferias" | "congresso"
  data_inicio: string
  data_fim: string
}

export const TIPOS_AFASTAMENTO = [
  { valor: "ferias", rotulo: "Férias" },
  { valor: "congresso", rotulo: "Congresso" },
] as const

export function formatarDataCurta(data: string) {
  const [, mes, dia] = data.split("-")
  return `${dia}/${mes}`
}

export function rotuloAfastamento(a: Afastamento) {
  const tipo = a.tipo === "ferias" ? "férias" : "congresso"
  return `${tipo} ${formatarDataCurta(a.data_inicio)}–${formatarDataCurta(a.data_fim)}`
}

// Motivo na lista de busca, onde o médico aparece mas não pode ser escolhido
export function AvisoAfastamento({ afastamento }: { afastamento: Afastamento }) {
  return (
    <span className="ml-auto shrink-0 text-[11px] font-medium text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
      {afastamento.tipo === "ferias" ? "De férias" : "Em congresso"} até {formatarDataCurta(afastamento.data_fim)}
    </span>
  )
}
