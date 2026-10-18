"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import SiglaBadge from "../../../components/SiglaBadge"
import FichaModal from "../../../components/FichaModal"
import { FichaResumo, rotuloTipo } from "../../../components/fichas"
import { apiFetch } from "../../../components/sessao"

// Quem cria fichas — mesma lista do requireRole em Backend/src/routes/fichas.js
const ROLES_CRIAR_FICHA = ["anestesita_socio", "anestesita_plantonista", "escritorio", "admin", "tecnico"]

const FILTRO_CLASS =
  "border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent transition"

function diasAtras(dias: number) {
  const d = new Date()
  d.setDate(d.getDate() - dias)
  return d.toLocaleDateString("en-CA")
}

function formatarData(data: string) {
  return new Date(`${data}T00:00:00`).toLocaleDateString("pt-BR")
}

const nomeDe = (p: { nome?: string | null; email?: string | null; id: string }) => p.nome ?? p.email ?? p.id

export default function FichasPage() {
  const router = useRouter()
  const [fichas, setFichas] = useState<FichaResumo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [podeCriar, setPodeCriar] = useState(false)
  const [inicio, setInicio] = useState(() => diasAtras(30))
  const [fim, setFim] = useState("")
  const [buscaAnestesista, setBuscaAnestesista] = useState("")
  // undefined = modal fechado, null = nova ficha
  const [selecionada, setSelecionada] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    if (!localStorage.getItem("token")) {
      router.push("/login")
      return
    }
    try {
      const roles: string[] = JSON.parse(localStorage.getItem("roles") ?? "[]")
      setPodeCriar(roles.some((r) => ROLES_CRIAR_FICHA.includes(r)))
    } catch {
      setPodeCriar(false)
    }
  }, [router])

  const carregar = useCallback(() => {
    const token = localStorage.getItem("token")
    if (!token) return
    setLoading(true)
    const params = new URLSearchParams()
    if (inicio) params.set("inicio", inicio)
    if (fim) params.set("fim", fim)
    apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/fichas?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? "Não foi possível carregar as fichas.")
        setFichas(data)
        setError("")
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [inicio, fim])

  useEffect(() => {
    carregar()
  }, [carregar])

  // O filtro de anestesista é feito aqui mesmo, pelo nome ou pela sigla
  const visiveis = useMemo(() => {
    const termo = buscaAnestesista.trim().toLowerCase()
    if (!termo) return fichas
    return fichas.filter((f) =>
      f.anestesistas.some((a) => [a.nome, a.sigla, a.email].some((v) => v?.toLowerCase().includes(termo))),
    )
  }, [fichas, buscaAnestesista])

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-xl font-bold text-gray-800">Fichas anestésicas</h1>
        {podeCriar && (
          <button
            onClick={() => setSelecionada(null)}
            className="shrink-0 bg-brand-700 hover:bg-brand-800 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            + Nova ficha
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-6">
        <div>
          <label htmlFor="filtroInicio" className="block text-xs font-medium text-gray-500 mb-1">
            De
          </label>
          <input id="filtroInicio" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className={FILTRO_CLASS} />
        </div>
        <div>
          <label htmlFor="filtroFim" className="block text-xs font-medium text-gray-500 mb-1">
            Até
          </label>
          <input id="filtroFim" type="date" value={fim} min={inicio || undefined} onChange={(e) => setFim(e.target.value)} className={FILTRO_CLASS} />
        </div>
        <div className="flex-1 min-w-[12rem]">
          <label htmlFor="filtroAnestesista" className="block text-xs font-medium text-gray-500 mb-1">
            Anestesista
          </label>
          <input
            id="filtroAnestesista"
            type="text"
            value={buscaAnestesista}
            onChange={(e) => setBuscaAnestesista(e.target.value)}
            placeholder="Nome ou sigla"
            className={`${FILTRO_CLASS} w-full`}
          />
        </div>
      </div>

      {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-6">{error}</p>}

      <div className={`bg-white rounded-xl border border-gray-200 overflow-x-auto ${loading ? "opacity-60" : ""} transition-opacity`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-200">
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Anestesistas</th>
              <th className="px-4 py-3 hidden sm:table-cell">Tipo</th>
              <th className="px-4 py-3 hidden md:table-cell">Registrada por</th>
              <th className="px-4 py-3 text-right">Foto</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((f) => (
              <tr
                key={f.id}
                onClick={() => setSelecionada(f.id)}
                className="border-b border-gray-100 last:border-0 cursor-pointer hover:bg-gray-50"
              >
                <td className="px-4 py-3 whitespace-nowrap">
                  <p className="font-medium text-gray-800">{formatarData(f.data)}</p>
                  <p className="text-xs text-gray-500">
                    {f.hora_inicio.slice(0, 5)} – {f.data_fim !== f.data && `${formatarData(f.data_fim).slice(0, 5)} `}
                    {f.hora_fim.slice(0, 5)}
                  </p>
                </td>
                <td className="px-4 py-3 max-w-0 w-full sm:max-w-none sm:w-auto">
                  <div className="flex items-center gap-2">
                    {/* Siglas sobrepostas, uma por médico da ficha */}
                    <div className="flex shrink-0 -space-x-1.5">
                      {f.anestesistas.map((a) => (
                        <span key={a.id} className="rounded-full ring-2 ring-white">
                          <SiglaBadge sigla={a.sigla} size="sm" />
                        </span>
                      ))}
                    </div>
                    <div className="min-w-0">
                      <p className="text-gray-800 truncate">{f.anestesistas.map(nomeDe).join(", ")}</p>
                      {/* No celular o tipo aparece aqui, já que a coluna fica escondida */}
                      <p className="text-xs text-gray-500 truncate sm:hidden">{rotuloTipo(f)}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 hidden sm:table-cell text-gray-700">{rotuloTipo(f)}</td>
                <td className="px-4 py-3 hidden md:table-cell text-xs text-gray-500">
                  {nomeDe(f.criadoPor)}
                  {f.atualizadoPor && <span className="block">editada por {nomeDe(f.atualizadoPor)}</span>}
                </td>
                <td className="px-4 py-3 text-right text-xs text-gray-500 whitespace-nowrap">
                  {f.qtdFotos > 0 ? "📷" : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && visiveis.length === 0 && <p className="px-4 py-8 text-center text-sm text-gray-400">Nenhuma ficha nesse período.</p>}
      </div>

      {selecionada !== undefined && (
        <FichaModal fichaId={selecionada} onClose={() => setSelecionada(undefined)} onSaved={carregar} />
      )}
    </main>
  )
}
