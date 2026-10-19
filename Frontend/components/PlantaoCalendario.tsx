"use client"

import { Fragment } from "react"
import SiglaBadge from "./SiglaBadge"
import { Afastamento, afastamentoPendente, avisoAfastamento } from "./disponibilidade"
import { TURNOS, Turno, formatarTurno, rotuloPosicaoCurto, turnoDaPosicao } from "./posicoes"
import { formatarIntervalo } from "./trocaPorHoras"

export type TrocaPendente = {
  id: string
  solicitadoEm: string
  usuarioEntrada: { id: string; nome?: string | null; email?: string | null; sigla?: string | null }
  solicitadoPor: { id: string; nome?: string | null; email?: string | null; sigla?: string | null }
  // Preenchidos na troca por horas
  horaInicio?: string | null
  horaFim?: string | null
}

// Troca por horas aceita: a vaga continua do titular e "usuario" cobre o intervalo.
// Cobertura de férias (ferias): "usuario" cobre o turno inteiro e o titular de férias continua na vaga
export type Cobertura = {
  id: string
  usuario: { id: string; nome?: string | null; email?: string | null; sigla?: string | null }
  horaInicio: string
  horaFim: string
  ferias?: boolean
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
  cobertura?: Cobertura | null
}

// Um plantão por dia, com as vagas do diurno e do noturno (components/posicoes.ts).
// Quem faz os dois turnos aparece duas vezes em usuarios, uma em cada vaga
export type Plantao = {
  id: string
  titulo: string
  descricao: string | null
  data: string
  usuarios: Usuario[]
}

export type Visualizacao = "semana" | "mes"

// Cor de cada turno: faixa à esquerda do card e legenda
const ESTILO_TURNO: Record<Turno, { faixa: string; ponto: string }> = {
  diurno: { faixa: "border-l-amber-400", ponto: "bg-amber-400" },
  noturno: { faixa: "border-l-indigo-500", ponto: "bg-indigo-500" },
}

export function doTurno(plantao: Plantao, turno: Turno) {
  return plantao.usuarios.filter((u) => u.posicao != null && turnoDaPosicao(u.posicao) === turno)
}

// Sigla com os indicadores: anel roxo do coordenador, ponto laranja de troca pendente,
// "!" de afastamento aprovado ou "?" de pedido pendente, a sigla de quem cobre (troca por horas ou férias)
// e a posição na fila ou na equipe.
// Também usada no Meu plantão, onde a posição já aparece na linha da tabela.
// data: o dia do plantão, porque o nome da vaga muda no fim de semana
export function BadgeComMarcador({
  usuario,
  data,
  size = "sm",
  mostrarPosicao = true,
}: {
  usuario: Usuario
  data: string
  size?: "sm" | "responsivo"
  mostrarPosicao?: boolean
}) {
  return (
    <div
      className="relative shrink-0"
      title={
        [
          usuario.nome ?? usuario.email,
          usuario.afastamento && avisoAfastamento(usuario.afastamento),
          usuario.trocaPendente && "Troca pendente de aceite",
          usuario.cobertura &&
            (usuario.cobertura.ferias
              ? `Coberto por ${usuario.cobertura.usuario.nome ?? usuario.cobertura.usuario.email}`
              : `${usuario.cobertura.usuario.nome ?? usuario.cobertura.usuario.email} cobre ${formatarIntervalo(usuario.cobertura.horaInicio, usuario.cobertura.horaFim)}`),
        ]
          .filter(Boolean)
          .join(" · ") || undefined
      }
    >
      <div className={usuario.coordenador ? "rounded-full ring-2 ring-purple-600" : undefined}>
        <SiglaBadge sigla={usuario.sigla} size={size} semTitulo />
      </div>
      {usuario.trocaPendente && (
        <span className="absolute -top-1 -left-1 w-2.5 h-2.5 rounded-full bg-orange-500 border border-white" />
      )}
      {usuario.afastamento && (
        <span
          className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border border-white text-white text-[8px] font-bold flex items-center justify-center leading-none ${
            afastamentoPendente(usuario.afastamento) ? "bg-amber-500" : "bg-red-600"
          }`}
        >
          {afastamentoPendente(usuario.afastamento) ? "?" : "!"}
        </span>
      )}
      {usuario.cobertura && (
        <span className="absolute -bottom-1 -left-1 min-w-4 h-4 px-0.5 rounded-full bg-sky-500 border border-white text-white text-[9px] font-bold flex items-center justify-center leading-none">
          {usuario.cobertura.usuario.sigla ?? "?"}
        </span>
      )}
      {/* O coordenador já tem o anel; os demais mostram a vaga */}
      {mostrarPosicao && usuario.posicao != null && !usuario.coordenador && (
        <span className="absolute -bottom-1 -right-1 min-w-3.5 h-3.5 px-0.5 rounded-full bg-gray-700 text-white text-[8px] font-bold flex items-center justify-center leading-none">
          {rotuloPosicaoCurto(data, usuario.posicao)}
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

// As siglas de um turno do plantão; sem ninguém, o lugar de uma sigla vazia
function SiglasDoTurno({ plantao, turno }: { plantao: Plantao; turno: Turno }) {
  const usuarios = doTurno(plantao, turno)
  return (
    <div className="flex items-center gap-1.5 md:gap-1 flex-wrap">
      {usuarios.length === 0 ? (
        <SiglaBadge sigla={null} size="sm" />
      ) : (
        usuarios.map((u) => <BadgeComMarcador key={u.posicao} usuario={u} data={plantao.data} />)
      )}
    </div>
  )
}

// Desktop: um card por turno, na linha do turno
function CartaoTurno({ plantao: p, turno, onClick }: { plantao: Plantao; turno: Turno; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={p.titulo}
      className={`w-full flex-1 flex flex-col text-left bg-white hover:bg-brand-50 border border-gray-200 hover:border-brand-200 border-l-4 ${ESTILO_TURNO[turno].faixa} rounded-lg px-2.5 py-2.5 transition-colors`}
    >
      <div className="mb-1.5">
        <SiglasDoTurno plantao={p} turno={turno} />
      </div>
      <p className="mt-auto text-xs text-gray-600 truncate">{p.titulo}</p>
    </button>
  )
}

// Celular: o plantão inteiro num card, com o diurno e o noturno um embaixo do outro
function CartaoPlantao({ plantao: p, onClick }: { plantao: Plantao; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={p.titulo}
      className="w-full flex flex-col gap-2 text-left bg-white hover:bg-brand-50 border border-gray-200 hover:border-brand-200 rounded-lg px-3 py-3 transition-colors"
    >
      {TURNOS.map((t) => (
        <div key={t.valor} className={`border-l-4 ${ESTILO_TURNO[t.valor].faixa} pl-2`}>
          <p className="text-xs font-medium text-gray-400 mb-1">
            {t.rotulo} · {formatarTurno(t.valor)}
          </p>
          <SiglasDoTurno plantao={p} turno={t.valor} />
        </div>
      ))}
      <p className="text-sm text-gray-600 truncate">{p.titulo}</p>
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

  // Um plantão por dia
  const plantaoPorDia = new Map(plantoes.map((p) => [p.data, p]))
  const diasSemana = gerarCelulasSemana(dataReferencia)

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
            {TURNOS.map((t) => (
              <span key={t.valor} className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className={`w-2.5 h-2.5 rounded-full ${ESTILO_TURNO[t.valor].ponto}`} />
                {t.rotulo} {formatarTurno(t.valor)}
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

              {TURNOS.map((turno) => (
                <Fragment key={turno.valor}>
                  <div className="pt-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                    {turno.rotulo}
                    <span className="block normal-case font-medium tracking-normal">{formatarTurno(turno.valor)}</span>
                  </div>
                  {diasSemana.map((data) => {
                    const chave = formatarDataLocal(data)
                    const plantao = plantaoPorDia.get(chave)
                    return (
                      <div
                        key={chave}
                        className={`min-h-[160px] flex flex-col rounded-lg p-1.5 border ${
                          chave === hojeChave ? "bg-brand-50/60 border-brand-100" : "bg-gray-50 border-gray-100"
                        }`}
                      >
                        {plantao && (
                          <CartaoTurno plantao={plantao} turno={turno.valor} onClick={() => onSelectPlantao(plantao)} />
                        )}
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
              const plantao = plantaoPorDia.get(chave)
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
                  <div className="bg-gray-50 rounded-lg p-2 border border-gray-100">
                    {plantao ? (
                      <CartaoPlantao plantao={plantao} onClick={() => onSelectPlantao(plantao)} />
                    ) : (
                      <p className="text-xs text-gray-300 text-center py-2">Sem plantão</p>
                    )}
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
                const plantao = plantaoPorDia.get(chave)
                const ehHoje = chave === hojeChave

                return (
                  <div
                    key={chave + (noMes ? "" : "-fora")}
                    className={`min-h-[88px] sm:min-h-[156px] p-1 sm:p-1.5 flex flex-col gap-1 ${noMes ? "bg-white" : "bg-gray-50"}`}
                  >
                    <span
                      className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-medium ${
                        ehHoje ? "bg-brand-700 text-white" : noMes ? "text-gray-600" : "text-gray-300"
                      }`}
                    >
                      {data.getDate()}
                    </span>

                    {/* Uma linha por turno: as três primeiras siglas e quantos mais */}
                    {plantao && (
                      <button
                        type="button"
                        onClick={() => onSelectPlantao(plantao)}
                        title={plantao.titulo}
                        className="flex-1 space-y-1 overflow-hidden text-left rounded hover:bg-brand-50 transition-colors"
                      >
                        {TURNOS.map((t) => {
                          const usuarios = doTurno(plantao, t.valor)
                          return (
                            <div
                              key={t.valor}
                              className={`flex items-center gap-1 bg-brand-50 border-l-[3px] ${ESTILO_TURNO[t.valor].faixa} px-0.5 sm:px-1 py-0.5 rounded`}
                            >
                              <div className="hidden sm:flex -space-x-1 shrink-0">
                                {usuarios.slice(0, 3).map((u) => (
                                  <BadgeComMarcador key={u.posicao} usuario={u} data={plantao.data} />
                                ))}
                              </div>
                              {usuarios.length > 3 && (
                                <span className="hidden sm:inline text-[9px] text-gray-400 shrink-0">+{usuarios.length - 3}</span>
                              )}
                              <span className="sm:hidden text-[9px] tracking-tight text-gray-500">{usuarios.length}</span>
                            </div>
                          )
                        })}
                      </button>
                    )}
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
