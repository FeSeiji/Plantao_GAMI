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

// Férias ou congresso (datas AAAA-MM-DD, inclusivas). Só o aprovado bloqueia a escala;
// o pendente aparece nos plantões como aviso de que há um pedido aguardando a gestão.
export type Afastamento = {
  id: string
  tipo: "ferias" | "congresso"
  // Só no congresso; null nos cadastrados antes dos tipos (não descontam até alguém definir)
  congresso_tipo?: TipoCongresso | null
  data_inicio: string
  data_fim: string
  status?: "pendente" | "aprovado"
}

// Congresso: o médico continua na escala e recebe só parte da vaga (FATOR_CONGRESSO em
// Backend/src/services/afastamentos.js). A tela mostra só o nome do tipo, nunca a porcentagem
export type TipoCongresso = "palestrante" | "congressista"
export const TIPOS_CONGRESSO: { valor: TipoCongresso; rotulo: string }[] = [
  { valor: "palestrante", rotulo: "Palestrante" },
  { valor: "congressista", rotulo: "Congressista" },
]

// "Palestrante", ou o aviso para quem ainda não definiu
export function rotuloTipoCongresso(tipo?: TipoCongresso | null) {
  return TIPOS_CONGRESSO.find((x) => x.valor === tipo)?.rotulo ?? "definir tipo"
}

export const afastamentoPendente = (a?: Afastamento | null) => a?.status === "pendente"

// Férias aprovadas: a vaga não troca de mãos; outro médico cobre o turno inteiro e os dois recebem os pontos
// (cobertura de férias). Congresso vai ter uma regra própria
export const deFerias = (a?: Afastamento | null) => a?.tipo === "ferias" && !afastamentoPendente(a)

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

// Aviso na vaga do plantão (linha do modal e título da sigla no calendário).
// Congresso aprovado não tira o médico da escala: mostra o tipo (palestrante ou congressista)
export function avisoAfastamento(a: Afastamento) {
  if (afastamentoPendente(a)) return `Pedido de ${rotuloAfastamento(a)} aguardando aprovação`
  if (a.tipo === "congresso") return `Congresso ${rotuloAfastamento(a).replace("congresso ", "")}: ${rotuloTipoCongresso(a.congresso_tipo)}`
  return `Indisponível: ${rotuloAfastamento(a)}`
}

// Motivo na lista de busca, onde o médico aparece mas não pode ser escolhido
export function AvisoAfastamento({ afastamento }: { afastamento: Afastamento }) {
  return (
    <span className="ml-auto shrink-0 text-[11px] font-medium text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
      {afastamento.tipo === "ferias" ? "De férias" : "Em congresso"} até {formatarDataCurta(afastamento.data_fim)}
    </span>
  )
}
