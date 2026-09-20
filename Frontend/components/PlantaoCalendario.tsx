"use client"

import SiglaBadge from "./SiglaBadge"

export type Usuario = {
  id: string
  nome?: string | null
  email?: string | null
  sigla?: string | null
}

export type Plantao = {
  id: string
  titulo: string
  descricao: string | null
  data: string
  hora_inicio: string
  hora_fim: string
  usuarios: Usuario[]
}

export type Visualizacao = "semana" | "mes"

type Props = {
  visualizacao: Visualizacao
  dataReferencia: Date
  plantoes: Plantao[]
  onVisualizacaoChange: (v: Visualizacao) => void
  onDataReferenciaChange: (d: Date) => void
  onSelectPlantao: (plantao: Plantao) => void
}

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]
const MESES_ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]

export function formatarDataLocal(d: Date) {
  const ano = d.getFullYear()
  const mes = String(d.getMonth() + 1).padStart(2, "0")
  const dia = String(d.getDate()).padStart(2, "0")
  return `${ano}-${mes}-${dia}`
}

function inicioDaSemana(d: Date) {
  const inicio = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  inicio.setDate(inicio.getDate() - inicio.getDay())
  return inicio
}

export function calcularIntervaloVisivel(dataReferencia: Date, visualizacao: Visualizacao) {
  if (visualizacao === "semana") {
    const inicio = inicioDaSemana(dataReferencia)
    const fim = new Date(inicio)
    fim.setDate(inicio.getDate() + 6)
    return { inicio: formatarDataLocal(inicio), fim: formatarDataLocal(fim) }
  }

  const primeiroDiaMes = new Date(dataReferencia.getFullYear(), dataReferencia.getMonth(), 1)
  const ultimoDiaMes = new Date(dataReferencia.getFullYear(), dataReferencia.getMonth() + 1, 0)
  const inicio = inicioDaSemana(primeiroDiaMes)
  const fim = new Date(ultimoDiaMes)
  fim.setDate(fim.getDate() + (6 - fim.getDay()))
  return { inicio: formatarDataLocal(inicio), fim: formatarDataLocal(fim) }
}

function gerarCelulasMes(mes: Date) {
  const ano = mes.getFullYear()
  const mesIndex = mes.getMonth()
  const primeiroDia = new Date(ano, mesIndex, 1)
  const ultimoDia = new Date(ano, mesIndex + 1, 0)
  const diaSemanaInicio = primeiroDia.getDay()

  const celulas: { data: Date; noMes: boolean }[] = []

  for (let i = diaSemanaInicio - 1; i >= 0; i--) {
    celulas.push({ data: new Date(ano, mesIndex, -i), noMes: false })
  }
  for (let d = 1; d <= ultimoDia.getDate(); d++) {
    celulas.push({ data: new Date(ano, mesIndex, d), noMes: true })
  }
  while (celulas.length % 7 !== 0) {
    const ultima = celulas[celulas.length - 1].data
    celulas.push({ data: new Date(ultima.getFullYear(), ultima.getMonth(), ultima.getDate() + 1), noMes: false })
  }

  return celulas
}

function gerarCelulasSemana(dataReferencia: Date) {
  const inicio = inicioDaSemana(dataReferencia)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(inicio)
    d.setDate(inicio.getDate() + i)
    return d
  })
}

function rotuloPeriodo(dataReferencia: Date, visualizacao: Visualizacao) {
  if (visualizacao === "mes") {
    return dataReferencia.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
  }

  const inicio = inicioDaSemana(dataReferencia)
  const fim = new Date(inicio)
  fim.setDate(inicio.getDate() + 6)

  const mesmoMes = inicio.getMonth() === fim.getMonth() && inicio.getFullYear() === fim.getFullYear()
  if (mesmoMes) {
    return `${inicio.getDate()} – ${fim.getDate()} de ${MESES_ABREV[inicio.getMonth()]}. de ${inicio.getFullYear()}`
  }
  return `${inicio.getDate()} de ${MESES_ABREV[inicio.getMonth()]}. – ${fim.getDate()} de ${MESES_ABREV[fim.getMonth()]}. de ${fim.getFullYear()}`
}

export default function PlantaoCalendario({
  visualizacao,
  dataReferencia,
  plantoes,
  onVisualizacaoChange,
  onDataReferenciaChange,
  onSelectPlantao,
}: Props) {
  const hojeChave = formatarDataLocal(new Date())

  const plantoesPorDia = new Map<string, Plantao[]>()
  for (const p of plantoes) {
    const lista = plantoesPorDia.get(p.data) ?? []
    lista.push(p)
    plantoesPorDia.set(p.data, lista)
  }

  function anterior() {
    if (visualizacao === "semana") {
      const d = new Date(dataReferencia)
      d.setDate(d.getDate() - 7)
      onDataReferenciaChange(d)
    } else {
      onDataReferenciaChange(new Date(dataReferencia.getFullYear(), dataReferencia.getMonth() - 1, 1))
    }
  }

  function seguinte() {
    if (visualizacao === "semana") {
      const d = new Date(dataReferencia)
      d.setDate(d.getDate() + 7)
      onDataReferenciaChange(d)
    } else {
      onDataReferenciaChange(new Date(dataReferencia.getFullYear(), dataReferencia.getMonth() + 1, 1))
    }
  }

  function irParaHoje() {
    onDataReferenciaChange(new Date())
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="font-semibold text-gray-800 capitalize">{rotuloPeriodo(dataReferencia, visualizacao)}</h2>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => onVisualizacaoChange("semana")}
              className={`text-xs font-semibold px-2.5 py-1 rounded-md transition-colors ${
                visualizacao === "semana" ? "bg-white text-brand-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Semana
            </button>
            <button
              type="button"
              onClick={() => onVisualizacaoChange("mes")}
              className={`text-xs font-semibold px-2.5 py-1 rounded-md transition-colors ${
                visualizacao === "mes" ? "bg-white text-brand-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Mês
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={irParaHoje}
              className="text-xs font-semibold text-brand-700 hover:text-brand-900 px-2 py-1.5 rounded-lg hover:bg-brand-50 transition-colors mr-1"
            >
              Hoje
            </button>
            <button
              type="button"
              onClick={anterior}
              aria-label={visualizacao === "semana" ? "Semana anterior" : "Mês anterior"}
              className="text-gray-500 hover:text-gray-800 hover:bg-gray-100 p-1.5 rounded-lg transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <button
              type="button"
              onClick={seguinte}
              aria-label={visualizacao === "semana" ? "Próxima semana" : "Próximo mês"}
              className="text-gray-500 hover:text-gray-800 hover:bg-gray-100 p-1.5 rounded-lg transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {visualizacao === "semana" ? (
        <div className="overflow-x-auto">
          <div className="min-w-[720px] grid grid-cols-7 gap-2">
            {gerarCelulasSemana(dataReferencia).map((data) => {
              const chave = formatarDataLocal(data)
              const doDia = (plantoesPorDia.get(chave) ?? []).slice().sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio))
              const ehHoje = chave === hojeChave

              return (
                <div key={chave} className="flex flex-col">
                  <div className="flex items-baseline justify-center gap-1.5 mb-2">
                    <span className="text-xs font-semibold text-gray-400">{DIAS_SEMANA[data.getDay()]}</span>
                    <span
                      className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold ${
                        ehHoje ? "bg-brand-700 text-white" : "text-gray-700"
                      }`}
                    >
                      {data.getDate()}
                    </span>
                  </div>

                  <div className="flex-1 min-h-[280px] max-h-[420px] overflow-y-auto space-y-1.5 bg-gray-50 rounded-lg p-1.5 border border-gray-100">
                    {doDia.length === 0 && <div className="h-full" />}
                    {doDia.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => onSelectPlantao(p)}
                        title={p.titulo}
                        className="w-full text-left bg-white hover:bg-brand-50 border border-gray-200 hover:border-brand-200 rounded-lg px-2 py-1.5 transition-colors"
                      >
                        <p className="text-[10px] font-medium text-gray-400 mb-1">
                          {p.hora_inicio.slice(0, 5)}–{p.hora_fim.slice(0, 5)}
                        </p>
                        <div className="flex items-center gap-1 flex-wrap mb-1">
                          {p.usuarios.length === 0 ? (
                            <SiglaBadge sigla={null} size="sm" />
                          ) : (
                            p.usuarios.map((u) => <SiglaBadge key={u.id} sigla={u.sigla} size="sm" />)
                          )}
                        </div>
                        <p className="text-[11px] text-gray-600 truncate">{p.titulo}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[560px]">
            <div className="grid grid-cols-7 mb-1">
              {DIAS_SEMANA.map((dia) => (
                <div key={dia} className="text-center text-xs font-semibold text-gray-400 py-1">
                  {dia}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden border border-gray-200">
              {gerarCelulasMes(dataReferencia).map(({ data, noMes }) => {
                const chave = formatarDataLocal(data)
                const doDia = (plantoesPorDia.get(chave) ?? []).slice().sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio))
                const ehHoje = chave === hojeChave

                return (
                  <div
                    key={chave + (noMes ? "-fora" : "")}
                    className={`min-h-[88px] sm:min-h-[108px] p-1.5 flex flex-col gap-1 ${noMes ? "bg-gray-50" : "bg-white"}`}
                  >
                    <span
                      className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-medium ${
                        ehHoje ? "bg-brand-700 text-white" : noMes ? "text-gray-300" : "text-gray-600"
                      }`}
                    >
                      {data.getDate()}
                    </span>

                    <div className="flex-1 space-y-1 overflow-hidden">
                      {doDia.slice(0, 3).map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => onSelectPlantao(p)}
                          title={p.titulo}
                          className="w-full flex items-center gap-1 text-left bg-brand-50 hover:bg-brand-100 px-1 py-0.5 rounded transition-colors"
                        >
                          <div className="flex -space-x-1 shrink-0">
                            {p.usuarios.slice(0, 3).map((u) => (
                              <SiglaBadge key={u.id} sigla={u.sigla} size="sm" />
                            ))}
                          </div>
                          {p.usuarios.length > 3 && (
                            <span className="text-[9px] text-gray-400 shrink-0">+{p.usuarios.length - 3}</span>
                          )}
                          <span className="text-[10px] text-gray-500 truncate">{p.hora_inicio.slice(0, 5)}</span>
                        </button>
                      ))}
                      {doDia.length > 3 && (
                        <p className="text-[10px] text-gray-400 px-1.5">+{doDia.length - 3} mais</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
