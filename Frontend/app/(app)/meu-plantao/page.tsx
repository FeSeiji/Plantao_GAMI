"use client"

import { Fragment, useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import PlantaoModal, { ROLES_EDITAR_PLANTAO } from "../../../components/PlantaoModal"
import PlantaoExtraModal from "../../../components/PlantaoExtraModal"
import SiglaBadge from "../../../components/SiglaBadge"
import { PlantaoExtra, formatarHorarioExtra } from "../../../components/extras"
import {
  BadgeComMarcador,
  Plantao,
  calcularIntervaloVisivel,
  formatarDataLocal,
} from "../../../components/PlantaoCalendario"
import {
  TURNOS,
  formatarTurno,
  linhasDoTurno,
  rotuloPosicao,
  rotuloPosicaoCurto,
  vagaNaoExisteNoDia,
} from "../../../components/posicoes"
import { apiFetch } from "../../../components/sessao"

// Médicos e a gestão (técnico e escritório) veem esta tela — mesma lista em components/Sidebar.tsx
const ROLES_MEU_PLANTAO = ["anestesita_socio", "anestesita_socio_jr", "anestesita_plantonista", "tecnico", "escritorio"]

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]
const MESES_ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]

function lerRoles(): string[] {
  try {
    return JSON.parse(localStorage.getItem("roles") ?? "[]")
  } catch {
    return []
  }
}

// "2026-10-05" → Date local (new Date("2026-10-05") seria UTC e poderia cair no dia anterior)
function paraDataLocal(data: string) {
  const [ano, mes, dia] = data.split("-").map(Number)
  return new Date(ano, mes - 1, dia)
}

function rotuloSemana(dias: Date[]) {
  const primeiro = dias[0]
  const ultimo = dias[6]
  const inicio =
    primeiro.getMonth() === ultimo.getMonth()
      ? String(primeiro.getDate())
      : `${primeiro.getDate()} ${MESES_ABREV[primeiro.getMonth()]}`
  return `${inicio} – ${ultimo.getDate()} ${MESES_ABREV[ultimo.getMonth()]} ${ultimo.getFullYear()}`
}

export default function MeuPlantaoPage() {
  const router = useRouter()
  const [dataReferencia, setDataReferencia] = useState(() => new Date())
  const [plantoes, setPlantoes] = useState<Plantao[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [meuId, setMeuId] = useState<string | null>(null)
  const [plantaoSelecionado, setPlantaoSelecionado] = useState<Plantao | null>(null)
  const [extras, setExtras] = useState<PlantaoExtra[]>([])
  const [extraSelecionado, setExtraSelecionado] = useState<PlantaoExtra | null>(null)
  const [souGestao, setSouGestao] = useState(false)

  const { inicio, fim } = useMemo(() => calcularIntervaloVisivel(dataReferencia, "semana"), [dataReferencia])

  // Os 7 dias da semana (domingo a sábado), com ou sem plantão
  const dias = useMemo(() => {
    const primeiro = paraDataLocal(inicio)
    return Array.from({ length: 7 }, (_, i) => new Date(primeiro.getFullYear(), primeiro.getMonth(), primeiro.getDate() + i))
  }, [inicio])

  useEffect(() => {
    if (!localStorage.getItem("token")) {
      router.push("/login")
      return
    }
    if (!lerRoles().some((r) => ROLES_MEU_PLANTAO.includes(r))) {
      router.push("/dashboard")
      return
    }
    setMeuId(localStorage.getItem("userId"))
    setSouGestao(lerRoles().some((r) => ROLES_EDITAR_PLANTAO.includes(r)))
  }, [router])

  const carregarPlantoes = useCallback(() => {
    const token = localStorage.getItem("token")
    if (!token) return

    setLoading(true)
    setError("")
    const params = new URLSearchParams({ inicio, fim })
    const buscar = async (caminho: string) => {
      const res = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL}${caminho}?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Não foi possível carregar os plantões.")
      return data
    }
    Promise.all([buscar("/plantoes"), buscar("/plantoes-extras")])
      .then(([plantoesDaSemana, extrasDaSemana]) => {
        setPlantoes(plantoesDaSemana)
        setExtras(extrasDaSemana)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [inicio, fim])

  useEffect(() => {
    carregarPlantoes()
  }, [carregarPlantoes])

  // Um plantão por dia
  const plantaoPorDia = useMemo(() => new Map(plantoes.map((p) => [p.data, p])), [plantoes])

  const hoje = formatarDataLocal(new Date())

  function mudarSemana(delta: number) {
    setDataReferencia((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + delta * 7))
  }

  return (
    <main className="max-w-5xl mx-auto px-3 sm:px-6 py-6 sm:py-12">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 sm:mb-6">
        <h1 className="text-xl font-bold text-gray-800">Meu plantão</h1>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setDataReferencia(new Date())}
            className="text-xs font-semibold text-brand-700 hover:bg-brand-50 px-2.5 py-1.5 rounded-md mr-1"
          >
            Hoje
          </button>
          <button
            type="button"
            onClick={() => mudarSemana(-1)}
            aria-label="Semana anterior"
            className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <span className="font-semibold text-gray-800 min-w-40 text-center text-sm">{rotuloSemana(dias)}</span>
          <button
            type="button"
            onClick={() => mudarSemana(1)}
            aria-label="Próxima semana"
            className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </div>

      {error && (
        <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-6">{error}</p>
      )}

      <div
        className={`bg-white rounded-xl border border-gray-200 overflow-x-auto transition-opacity ${
          loading ? "opacity-60" : ""
        }`}
      >
        <table className="w-full min-w-[320px] table-fixed text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="w-9 sm:w-28" />
              {dias.map((dia) => {
                const chave = formatarDataLocal(dia)
                const ehHoje = chave === hoje
                return (
                  <th key={chave} className={`py-2.5 text-center ${ehHoje ? "bg-brand-50" : ""}`}>
                    <div className={`text-xs font-semibold ${ehHoje ? "text-brand-700" : "text-gray-500"}`}>
                      {DIAS_SEMANA[dia.getDay()]}
                    </div>
                    <div className={`text-base font-bold ${ehHoje ? "text-brand-700" : "text-gray-800"}`}>
                      {dia.getDate()}
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {/* Como na escala do cliente: as vagas do diurno e do noturno nas linhas, um plantão por dia */}
            {TURNOS.map((turno) => (
              <Fragment key={turno.valor}>
                <tr className="bg-gray-50 border-y border-gray-200">
                  <td className="py-1.5 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                    <span className="sm:hidden">{turno.rotulo.slice(0, 3)}</span>
                    <span className="hidden sm:inline">{turno.rotulo}</span>
                  </td>
                  <td colSpan={7} className="py-1.5 px-2 text-[11px] text-gray-500">
                    {formatarTurno(turno.valor)}
                  </td>
                </tr>
                {linhasDoTurno(turno.valor).map(({ posicao, rotulo, curto }) => (
                  <tr
                    key={posicao}
                    // Linha separando os coordenadores do resto do diurno
                    className={`border-b border-gray-100 ${posicao === 3 ? "border-t-2 border-t-gray-200" : ""}`}
                  >
                    <td className="py-2 text-center text-xs font-semibold text-gray-400">
                      <span className="sm:hidden">{curto}</span>
                      <span className="hidden sm:inline">{rotulo}</span>
                    </td>
                    {dias.map((dia) => {
                      const chave = formatarDataLocal(dia)
                      const plantao = plantaoPorDia.get(chave)
                      const usuario = plantao?.usuarios.find((u) => u.posicao === posicao)
                      // No fim de semana o 7º não existe e outras vagas mudam de nome (o 2º vira a manhã)
                      const semVaga = vagaNaoExisteNoDia(chave, posicao)
                      const outroNome = !semVaga && rotuloPosicao(chave, posicao) !== rotulo
                      return (
                        // A célula inteira abre o plantão, inclusive o espaço em volta da sigla e as vagas vazias
                        <td
                          key={chave}
                          onClick={plantao ? () => setPlantaoSelecionado(plantao) : undefined}
                          className={`py-2 text-center ${chave === hoje ? "bg-brand-50" : semVaga && plantao ? "bg-gray-50" : ""} ${
                            plantao ? `cursor-pointer ${chave === hoje ? "hover:bg-brand-100" : "hover:bg-gray-50"}` : ""
                          }`}
                          title={semVaga ? "Essa vaga não existe no fim de semana" : undefined}
                        >
                          {outroNome && (
                            <span className="block text-[9px] leading-none font-semibold text-gray-400 mb-0.5">
                              <span className="sm:hidden">{rotuloPosicaoCurto(chave, posicao)}</span>
                              <span className="hidden sm:inline">{rotuloPosicao(chave, posicao)}</span>
                            </span>
                          )}
                          {usuario ? (
                            // Sem onClick próprio: o clique (ou Enter pelo teclado) sobe para a célula
                            <button
                              type="button"
                              className={`inline-flex rounded-full cursor-pointer hover:opacity-80 ${
                                usuario.id === meuId || usuario.cobertura?.usuario.id === meuId
                                  ? "ring-2 ring-offset-1 ring-amber-400"
                                  : ""
                              }`}
                            >
                              {/* Mesmos indicadores do calendário; a vaga já é a linha da tabela */}
                              <BadgeComMarcador usuario={usuario} data={chave} size="responsivo" mostrarPosicao={false} />
                            </button>
                          ) : plantao && !semVaga ? (
                            <span className="text-gray-300">—</span>
                          ) : null}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}

            {/* Plantões extras da semana, em paralelo ao plantão do dia */}
            {extras.length > 0 && (
              <>
                <tr className="bg-amber-50/60 border-y border-amber-100">
                  <td className="py-1.5 text-center text-[11px] font-semibold text-amber-800 uppercase tracking-wide">
                    <span className="sm:hidden">Ext</span>
                    <span className="hidden sm:inline">Extras</span>
                  </td>
                  <td colSpan={7} className="py-1.5 px-2 text-[11px] text-amber-800">
                    Horário livre, sem troca
                  </td>
                </tr>
                <tr>
                  <td />
                  {dias.map((dia) => {
                    const chave = formatarDataLocal(dia)
                    return (
                      <td key={chave} className={`py-2 align-top text-center ${chave === hoje ? "bg-brand-50" : ""}`}>
                        <div className="flex flex-col items-center gap-1.5">
                          {extras
                            .filter((e) => e.data === chave)
                            .map((e) => (
                              <button
                                key={e.id}
                                type="button"
                                onClick={() => setExtraSelecionado(e)}
                                title={`${e.medico.nome ?? e.medico.email ?? ""} · ${formatarHorarioExtra(e)}`}
                                className="flex flex-col items-center gap-0.5 rounded-lg px-1 py-0.5 hover:bg-amber-50"
                              >
                                <span className={`inline-flex rounded-full ${e.medico.id === meuId ? "ring-2 ring-offset-1 ring-amber-400" : ""}`}>
                                  <SiglaBadge sigla={e.medico.sigla ?? null} size="responsivo" semTitulo />
                                </span>
                                <span className="text-[9px] sm:text-[10px] leading-none text-amber-900">{formatarHorarioExtra(e)}</span>
                              </button>
                            ))}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>

      {extraSelecionado && (
        <PlantaoExtraModal
          extra={extraSelecionado}
          podeEditar={souGestao}
          onClose={() => setExtraSelecionado(null)}
          onSaved={carregarPlantoes}
        />
      )}

      {plantaoSelecionado && (
        <PlantaoModal
          plantao={plantaoSelecionado}
          podeEditar
          onClose={() => setPlantaoSelecionado(null)}
          onUpdated={carregarPlantoes}
        />
      )}
    </main>
  )
}
