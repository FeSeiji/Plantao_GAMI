"use client"

import { Fragment, useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import SiglaBadge from "../../../components/SiglaBadge"
import PlantaoModal from "../../../components/PlantaoModal"
import {
  Plantao,
  TURNOS,
  calcularIntervaloVisivel,
  formatarDataLocal,
  turnoDe,
} from "../../../components/PlantaoCalendario"
import { POSICOES, POSICAO_INTERMEDIARIO, rotuloPosicao, rotuloPosicaoCurto } from "../../../components/posicoes"

// Por enquanto só sócios veem esta tela — mesma lista em components/Sidebar.tsx
const ROLES_MEU_PLANTAO = ["anestesita_socio"]

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
  }, [router])

  const carregarPlantoes = useCallback(() => {
    const token = localStorage.getItem("token")
    if (!token) return

    setLoading(true)
    setError("")
    const params = new URLSearchParams({ inicio, fim, tipo: "socio" })
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/plantoes?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? "Não foi possível carregar os plantões.")
        setPlantoes(data)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [inicio, fim])

  useEffect(() => {
    carregarPlantoes()
  }, [carregarPlantoes])

  // Plantões de cada dia, em ordem de horário
  const plantoesPorDia = useMemo(() => {
    const mapa = new Map<string, Plantao[]>()
    ;[...plantoes]
      .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio))
      .forEach((p) => mapa.set(p.data, [...(mapa.get(p.data) ?? []), p]))
    return mapa
  }, [plantoes])

  function doTurno(chave: string, turno: string) {
    return (plantoesPorDia.get(chave) ?? []).filter((p) => turnoDe(p.hora_inicio) === turno)
  }

  // Um bloco de posições por turno: manhã e noite sempre, tarde só se a semana tiver plantão nela
  const turnosVisiveis = TURNOS.filter(
    (t) => t.valor !== "tarde" || plantoes.some((p) => turnoDe(p.hora_inicio) === "tarde")
  )

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
            {turnosVisiveis.map((turno) => (
              <Fragment key={turno.valor}>
                <tr className="bg-gray-50 border-y border-gray-200">
                  <td className="py-1.5 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                    {turno.rotulo}
                  </td>
                  {dias.map((dia) => {
                    const chave = formatarDataLocal(dia)
                    return (
                      <td key={chave} className="py-1.5 text-center text-[11px] text-gray-500 leading-tight">
                        {/* Um plantão por subcoluna, alinhada com as siglas abaixo */}
                        <div className="flex">
                          {doTurno(chave, turno.valor).map((p) => (
                            <div key={p.id} className="flex-1 min-w-0">
                              {p.hora_inicio.slice(0, 5)}
                              <span className="hidden sm:block">{p.hora_fim.slice(0, 5)}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                    )
                  })}
                </tr>
                {POSICOES.map((posicao) => (
                  <tr
                    key={posicao}
                    className={`border-b border-gray-100 ${
                      posicao === POSICAO_INTERMEDIARIO ? "border-t-2 border-t-gray-200" : ""
                    }`}
                  >
                    <td className="py-2 text-center text-xs font-semibold text-gray-400">
                      <span className="sm:hidden">{rotuloPosicaoCurto(posicao)}</span>
                      <span className="hidden sm:inline">{rotuloPosicao(posicao)}</span>
                    </td>
                    {dias.map((dia) => {
                      const chave = formatarDataLocal(dia)
                      return (
                        <td key={chave} className={`py-2 text-center ${chave === hoje ? "bg-brand-50" : ""}`}>
                          <div className="flex items-center">
                            {doTurno(chave, turno.valor).map((p) => {
                              const usuario = p.usuarios.find((u) => u.posicao === posicao)
                              return (
                                <div key={p.id} className="flex-1 min-w-0 flex justify-center">
                                  {usuario ? (
                                    <button
                                      type="button"
                                      onClick={() => setPlantaoSelecionado(p)}
                                      className={`inline-flex rounded-full cursor-pointer hover:opacity-80 ${
                                        usuario.id === meuId ? "ring-2 ring-offset-1 ring-amber-400" : ""
                                      }`}
                                      title={usuario.nome ?? usuario.email ?? undefined}
                                    >
                                      <SiglaBadge sigla={usuario.sigla} size="responsivo" />
                                    </button>
                                  ) : (
                                    <span className="text-gray-300">—</span>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

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
