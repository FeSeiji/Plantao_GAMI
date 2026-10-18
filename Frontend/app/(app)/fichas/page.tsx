"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import SiglaBadge from "../../../components/SiglaBadge"
import FichaModal from "../../../components/FichaModal"
import ExportarFichasModal from "../../../components/ExportarFichasModal"
import { ROLES_ANESTESISTA, ROLES_EDICAO } from "../../../components/UsuarioModal"
import { FichaResumo, Pessoa, rotuloTipo } from "../../../components/fichas"
import { apiFetch } from "../../../components/sessao"

// Quem cria fichas — mesma lista do requireRole em Backend/src/routes/fichas.js
const ROLES_CRIAR_FICHA = ["anestesita_socio", "anestesita_plantonista", "escritorio", "admin", "tecnico"]
// O backend devolve a lista em páginas desse tamanho (FICHAS_POR_PAGINA em Backend/src/controllers/fichas.js)
const FICHAS_POR_PAGINA = 200

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
  // Gestão vê e exporta todas as fichas; o médico, só as dele
  const [ehGestao, setEhGestao] = useState(false)
  const [exportarAberto, setExportarAberto] = useState(false)
  const [inicio, setInicio] = useState(() => diasAtras(30))
  const [fim, setFim] = useState("")
  const [anestesistaId, setAnestesistaId] = useState("")
  const [anestesistas, setAnestesistas] = useState<Pessoa[]>([])
  // Página cheia = pode haver mais fichas no período
  const [temMais, setTemMais] = useState(false)
  const [carregandoMais, setCarregandoMais] = useState(false)
  // Só a resposta da busca mais recente vale (os filtros podem mudar no meio de um "Carregar mais")
  const buscaAtual = useRef(0)
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
      setEhGestao(roles.some((r) => ROLES_EDICAO.includes(r)))
    } catch {
      setPodeCriar(false)
      setEhGestao(false)
    }
  }, [router])

  // offset 0 recomeça a lista; maior que 0 acrescenta a próxima página ("Carregar mais")
  const buscar = useCallback(
    (offset: number) => {
      const token = localStorage.getItem("token")
      if (!token) return
      const busca = offset === 0 ? ++buscaAtual.current : buscaAtual.current
      if (offset === 0) setLoading(true)
      else setCarregandoMais(true)
      const params = new URLSearchParams({ offset: String(offset) })
      if (inicio) params.set("inicio", inicio)
      if (fim) params.set("fim", fim)
      if (anestesistaId) params.set("anestesista_id", anestesistaId)
      apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/fichas?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(async (res) => {
          const data = await res.json()
          if (!res.ok) throw new Error(data.error ?? "Não foi possível carregar as fichas.")
          if (busca !== buscaAtual.current) return
          setFichas((atuais) => (offset === 0 ? data : [...atuais, ...data]))
          setTemMais(data.length === FICHAS_POR_PAGINA)
          setError("")
        })
        .catch((err) => busca === buscaAtual.current && setError(err.message))
        .finally(() => {
          if (busca !== buscaAtual.current) return
          setLoading(false)
          setCarregandoMais(false)
        })
    },
    [inicio, fim, anestesistaId],
  )

  const carregar = useCallback(() => buscar(0), [buscar])

  useEffect(() => {
    carregar()
  }, [carregar])

  // Opções do filtro: sócios e plantonistas, como no cadastro de casos fora
  useEffect(() => {
    const token = localStorage.getItem("token")
    if (!token) return
    const params = new URLSearchParams({ role: ROLES_ANESTESISTA.join(",") })
    apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/users?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? "Não foi possível carregar os anestesistas.")
        setAnestesistas([...data].sort((a: Pessoa, b: Pessoa) => nomeDe(a).localeCompare(nomeDe(b), "pt-BR")))
      })
      .catch((err) => setError(err.message))
  }, [])

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-xl font-bold text-gray-800">Fichas anestésicas</h1>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setExportarAberto(true)}
            className="shrink-0 border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            Exportar
          </button>
          {podeCriar && (
            <button
              onClick={() => setSelecionada(null)}
              className="shrink-0 bg-brand-700 hover:bg-brand-800 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              + Nova ficha
            </button>
          )}
        </div>
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
          <select
            id="filtroAnestesista"
            value={anestesistaId}
            onChange={(e) => setAnestesistaId(e.target.value)}
            className={`${FILTRO_CLASS} w-full bg-white`}
          >
            <option value="">Todos</option>
            {anestesistas.map((a) => (
              <option key={a.id} value={a.id}>
                {nomeDe(a)}
                {a.sigla ? ` (${a.sigla})` : ""}
              </option>
            ))}
          </select>
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
            {fichas.map((f) => (
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
        {!loading && fichas.length === 0 && <p className="px-4 py-8 text-center text-sm text-gray-400">Nenhuma ficha nesse período.</p>}
      </div>

      {temMais && !loading && (
        <div className="flex justify-center mt-4">
          <button
            onClick={() => buscar(fichas.length)}
            disabled={carregandoMais}
            className="border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-60 text-gray-700 text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            {carregandoMais ? "Carregando..." : "Carregar mais"}
          </button>
        </div>
      )}

      {exportarAberto && <ExportarFichasModal ehGestao={ehGestao} onClose={() => setExportarAberto(false)} />}

      {selecionada !== undefined && (
        <FichaModal fichaId={selecionada} onClose={() => setSelecionada(undefined)} onSaved={carregar} />
      )}
    </main>
  )
}
