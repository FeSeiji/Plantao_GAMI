"use client"

import { Fragment } from "react"
import SiglaBadge from "./SiglaBadge"
import { Afastamento, rotuloAfastamento } from "./disponibilidade"
import { rotuloPosicaoCurto } from "./posicoes"

export type TrocaPendente = {
  id: string
  solicitadoEm: string
  usuarioEntrada: { id: string; nome?: string | null; email?: string | null; sigla?: string | null }
  solicitadoPor: { id: string; nome?: string | null; email?: string | null; sigla?: string | null }
}

export type Usuario = {
  id: string
  nome?: string | null
  email?: string | null
  sigla?: string | null
  coordenador?: boolean
  posicao?: number | null
  trocaPendente?: TrocaPendente | null
  afastamento?: Afastamento | null
}

export type Plantao = {
  id: string
  titulo: string
  descricao: string | null
  data: string
  hora_inicio: string
  hora_fim: string
  tipo: "plantonista" | "socio"
  usuarios: Usuario[]
}

export type Visualizacao = "semana" | "mes"

// Cor de cada tipo de plantão: faixa à esquerda do card, etiqueta e legenda
const ESTILO_TIPO = {
  plantonista: { rotulo: "Plantonista", faixa: "border-l-sky-500", etiqueta: "bg-sky-100 text-sky-800", ponto: "bg-sky-500" },
  socio: { rotulo: "Sócio", faixa: "border-l-teal-500", etiqueta: "bg-teal-100 text-teal-800", ponto: "bg-teal-500" },
}

function BadgeComMarcador({ usuario }: { usuario: Usuario }) {
  return (
    <div
      className="relative shrink-0"
      title={
        [
          usuario.afastamento && `Indisponível: ${rotuloAfastamento(usuario.afastamento)}`,
          usuario.trocaPendente && "Troca pendente de aceite",
        ]
          .filter(Boolean)
          .join(" · ") || undefined
      }
    >
      <div className={usuario.coordenador ? "rounded-full ring-2 ring-purple-600" : undefined}>
        <SiglaBadge sigla={usuario.sigla} size="sm" />
      </div>
      {usuario.trocaPendente && (
        <span className="absolute -top-1 -left-1 w-2.5 h-2.5 rounded-full bg-orange-500 border border-white" />
      )}
      {usuario.afastamento && (
        <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-600 border border-white text-white text-[8px] font-bold flex items-center justify-center leading-none">
          !
        </span>
      )}
      {usuario.posicao != null && (
        <span className="absolute -bottom-1 -right-1 min-w-3.5 h-3.5 px-0.5 rounded-full bg-gray-700 text-white text-[8px] font-bold flex items-center justify-center leading-none">
          {rotuloPosicaoCurto(usuario.posicao)}
        </span>
      )}
    </div>
  )
}

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

// Turno pelo horário de início — organiza a semana em linhas (normalmente um matinal e um noturno por dia)
export type Turno = "manha" | "tarde" | "noite"
export const TURNOS: { valor: Turno; rotulo: string }[] = [
  { valor: "manha", rotulo: "Manhã" },
  { valor: "tarde", rotulo: "Tarde" },
  { valor: "noite", rotulo: "Noite" },
]

export function turnoDe(horaInicio: string): Turno {
  const hora = Number(horaInicio.slice(0, 2))
  if (hora >= 5 && hora < 12) return "manha"
  if (hora >= 12 && hora < 18) return "tarde"
  return "noite"
}

function CartaoPlantao({ plantao: p, onClick }: { plantao: Plantao; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={p.titulo}
      className={`w-full flex flex-col text-left bg-white hover:bg-brand-50 border border-gray-200 hover:border-brand-200 border-l-4 ${ESTILO_TIPO[p.tipo].faixa} rounded-lg px-3 py-3 md:px-2.5 md:py-2.5 transition-colors`}
    >
      <div className="flex items-center justify-between gap-1 mb-1.5">
        <p className="text-xs md:text-[11px] font-medium text-gray-400">
          {p.hora_inicio.slice(0, 5)}–{p.hora_fim.slice(0, 5)}
        </p>
        <span className={`text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${ESTILO_TIPO[p.tipo].etiqueta}`}>
          {ESTILO_TIPO[p.tipo].rotulo}
        </span>
      </div>
      <div className="flex items-center gap-1.5 md:gap-1 flex-wrap mb-2 md:mb-1.5">
        {p.usuarios.length === 0 ? (
          <SiglaBadge sigla={null} size="sm" />
        ) : (
          p.usuarios.map((u) => <BadgeComMarcador key={u.id} usuario={u} />)
        )}
      </div>
      <p className="mt-auto text-sm md:text-xs text-gray-600 truncate">{p.titulo}</p>
    </button>
  )
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

  function doDia(chave: string) {
    return (plantoesPorDia.get(chave) ?? []).slice().sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio))
  }

  const diasSemana = gerarCelulasSemana(dataReferencia)
  // Manhã e noite sempre aparecem; a tarde só quando a semana tem plantão nesse turno
  const turnosVisiveis = TURNOS.filter(
    (t) =>
      t.valor !== "tarde" ||
      diasSemana.some((d) => doDia(formatarDataLocal(d)).some((p) => turnoDe(p.hora_inicio) === "tarde"))
  )

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
    <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <h2 className="font-semibold text-gray-800 capitalize">{rotuloPeriodo(dataReferencia, visualizacao)}</h2>
          <div className="flex items-center gap-3">
            {Object.values(ESTILO_TIPO).map((e) => (
              <span key={e.rotulo} className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className={`w-2.5 h-2.5 rounded-full ${e.ponto}`} />
                {e.rotulo}
              </span>
            ))}
          </div>
        </div>

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
        <>
          {/* Desktop: dias nas colunas e turnos nas linhas, para os plantões do mesmo turno ficarem alinhados */}
          <div className="hidden md:block overflow-x-auto">
            <div
              className="grid md:min-w-[980px] gap-2"
              style={{ gridTemplateColumns: "3.5rem repeat(7, minmax(0, 1fr))" }}
            >
              <div />
              {diasSemana.map((data) => {
                const ehHoje = formatarDataLocal(data) === hojeChave
                return (
                  <div key={data.toISOString()} className="flex items-baseline justify-center gap-1.5">
                    <span className="text-xs font-semibold text-gray-400">{DIAS_SEMANA[data.getDay()]}</span>
                    <span
                      className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold ${
                        ehHoje ? "bg-brand-700 text-white" : "text-gray-700"
                      }`}
                    >
                      {data.getDate()}
                    </span>
                  </div>
                )
              })}

              {turnosVisiveis.map((turno) => (
                <Fragment key={turno.valor}>
                  <div className="pt-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{turno.rotulo}</div>
                  {diasSemana.map((data) => {
                    const chave = formatarDataLocal(data)
                    const doTurno = doDia(chave).filter((p) => turnoDe(p.hora_inicio) === turno.valor)
                    return (
                      <div
                        key={chave}
                        className={`min-h-[120px] space-y-1.5 rounded-lg p-1.5 border ${
                          chave === hojeChave ? "bg-brand-50/60 border-brand-100" : "bg-gray-50 border-gray-100"
                        }`}
                      >
                        {doTurno.map((p) => (
                          <CartaoPlantao key={p.id} plantao={p} onClick={() => onSelectPlantao(p)} />
                        ))}
                      </div>
                    )
                  })}
                </Fragment>
              ))}
            </div>
          </div>

          {/* Celular: dias empilhados */}
          <div className="md:hidden space-y-4">
            {diasSemana.map((data) => {
              const chave = formatarDataLocal(data)
              const plantoesDoDia = doDia(chave)
              const ehHoje = chave === hojeChave
              return (
                <div key={chave}>
                  <div className="flex items-baseline gap-1.5 mb-2">
                    <span className="text-xs font-semibold text-gray-400">{DIAS_SEMANA[data.getDay()]}</span>
                    <span
                      className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold ${
                        ehHoje ? "bg-brand-700 text-white" : "text-gray-700"
                      }`}
                    >
                      {data.getDate()}
                    </span>
                  </div>
                  <div className="space-y-2 bg-gray-50 rounded-lg p-2 border border-gray-100">
                    {plantoesDoDia.length === 0 && <p className="text-xs text-gray-300 text-center py-2">Sem plantões</p>}
                    {plantoesDoDia.map((p) => (
                      <CartaoPlantao key={p.id} plantao={p} onClick={() => onSelectPlantao(p)} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      ) : (
        <div className="overflow-x-auto">
          <div className="sm:min-w-[560px]">
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
                const plantoesDoDia = doDia(chave)
                const ehHoje = chave === hojeChave

                return (
                  <div
                    key={chave + (noMes ? "" : "-fora")}
                    className={`min-h-[72px] sm:min-h-[124px] p-1 sm:p-1.5 flex flex-col gap-1 ${noMes ? "bg-white" : "bg-gray-50"}`}
                  >
                    <span
                      className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-medium ${
                        ehHoje ? "bg-brand-700 text-white" : noMes ? "text-gray-600" : "text-gray-300"
                      }`}
                    >
                      {data.getDate()}
                    </span>

                    <div className="flex-1 space-y-1 overflow-hidden">
                      {plantoesDoDia.slice(0, 3).map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => onSelectPlantao(p)}
                          title={`${p.titulo} · ${ESTILO_TIPO[p.tipo].rotulo}`}
                          className={`w-full flex items-center gap-1 text-left bg-brand-50 hover:bg-brand-100 border-l-[3px] ${ESTILO_TIPO[p.tipo].faixa} px-0.5 sm:px-1 py-0.5 rounded transition-colors`}
                        >
                          <div className="hidden sm:flex -space-x-1 shrink-0">
                            {p.usuarios.slice(0, 3).map((u) => (
                              <BadgeComMarcador key={u.id} usuario={u} />
                            ))}
                          </div>
                          {p.usuarios.length > 3 && (
                            <span className="hidden sm:inline text-[9px] text-gray-400 shrink-0">+{p.usuarios.length - 3}</span>
                          )}
                          <span className="text-[9px] sm:text-[10px] tracking-tight text-gray-500 truncate">{p.hora_inicio.slice(0, 5)}</span>
                        </button>
                      ))}
                      {plantoesDoDia.length > 3 && (
                        <p className="text-[10px] text-gray-400 px-1.5">+{plantoesDoDia.length - 3} mais</p>
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
