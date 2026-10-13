"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { apiFetch } from "./sessao"
import { formatarIntervalo } from "./trocaPorHoras"

type Pessoa = {
  id: string
  nome?: string | null
  email?: string | null
  sigla?: string | null
}

type TrocaPendente = {
  id: string
  solicitadoEm: string
  usuarioSaida: Pessoa
  usuarioEntrada: Pessoa
  solicitadoPor: Pessoa
  // Quem precisa aceitar: o substituto ou, se ele mesmo pediu a vaga, o titular
  respondenteId: string
  // Preenchidos na troca por horas
  horaInicio?: string | null
  horaFim?: string | null
  plantao: {
    id: string
    titulo: string
    data: string
    hora_inicio: string
    hora_fim: string
  }
}

// Pedido de férias/congresso aguardando a gestão
type AfastamentoPendente = {
  id: string
  tipo: "ferias" | "congresso"
  data_inicio: string
  data_fim: string
  observacao: string | null
  usuario: Pessoa
}

// Quem aprova férias e congressos — mesma lista do requireRole em Backend/src/routes/afastamentos.js
const ROLES_GESTAO = ["escritorio", "admin", "tecnico"]

function formatarData(data: string) {
  return new Date(`${data}T00:00:00`).toLocaleDateString("pt-BR")
}

const INTERVALO_POLL_MS = 30000
export const EVENTO_TROCAS_ATUALIZADAS = "trocas-atualizadas"

export default function NotificacaoTrocaSino() {
  const [pendentes, setPendentes] = useState<TrocaPendente[]>([])
  const [afastamentos, setAfastamentos] = useState<AfastamentoPendente[]>([])
  const [aberto, setAberto] = useState(false)
  const [processando, setProcessando] = useState<string | null>(null)
  const [error, setError] = useState("")
  const containerRef = useRef<HTMLDivElement>(null)

  const carregar = useCallback(() => {
    const token = localStorage.getItem("token")
    if (!token) return

    apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/plantoes/trocas/pendentes`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) return
        const data = await res.json()
        setPendentes(data)
      })
      .catch(() => {})

    let ehGestao = false
    try {
      ehGestao = JSON.parse(localStorage.getItem("roles") ?? "[]").some((r: string) => ROLES_GESTAO.includes(r))
    } catch {}
    if (!ehGestao) return

    apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/afastamentos/pendentes`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) return
        setAfastamentos(await res.json())
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    carregar()
    const intervalId = setInterval(carregar, INTERVALO_POLL_MS)
    window.addEventListener(EVENTO_TROCAS_ATUALIZADAS, carregar)
    return () => {
      clearInterval(intervalId)
      window.removeEventListener(EVENTO_TROCAS_ATUALIZADAS, carregar)
    }
  }, [carregar])

  useEffect(() => {
    function handleClickFora(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setAberto(false)
      }
    }
    document.addEventListener("mousedown", handleClickFora)
    return () => document.removeEventListener("mousedown", handleClickFora)
  }, [])

  async function responder(id: string, aceitar: boolean) {
    setError("")
    setProcessando(id)

    try {
      const token = localStorage.getItem("token")
      const res = await apiFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/plantoes/trocas/${id}/${aceitar ? "aceitar" : "recusar"}`,
        {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}` },
        }
      )

      const result = await res.json()

      if (!res.ok) {
        throw new Error(result.error ?? "Não foi possível responder a essa solicitação.")
      }

      setPendentes((prev) => prev.filter((t) => t.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível responder a essa solicitação.")
    } finally {
      setProcessando(null)
    }
  }

  async function responderAfastamento(id: string, aprovar: boolean) {
    setError("")
    setProcessando(id)

    try {
      const token = localStorage.getItem("token")
      const res = await apiFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/afastamentos/${id}/${aprovar ? "aprovar" : "recusar"}`,
        {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}` },
        }
      )

      const result = await res.json()

      if (!res.ok) {
        throw new Error(result.error ?? "Não foi possível responder a esse pedido.")
      }

      setAfastamentos((prev) => prev.filter((a) => a.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível responder a esse pedido.")
    } finally {
      setProcessando(null)
    }
  }

  const total = pendentes.length + afastamentos.length

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-label="Notificações"
        className="relative text-gray-500 hover:text-gray-800 hover:bg-gray-100 p-2 rounded-lg transition-colors"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {total > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center leading-none">
            {total > 9 ? "9+" : total}
          </span>
        )}
      </button>

      {aberto && (
        <div className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-white border border-gray-200 rounded-xl shadow-lg z-50 max-h-96 overflow-y-auto">
          <p className="text-sm font-semibold text-gray-700 px-4 py-3 border-b border-gray-100">
            Notificações
          </p>

          {error && (
            <p className="text-red-600 text-xs bg-red-50 border-b border-red-200 px-4 py-2">{error}</p>
          )}

          {afastamentos.length > 0 && (
            <>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 pt-3 pb-1">
                Férias e congressos
              </p>
              <ul className="divide-y divide-gray-100 border-b border-gray-100">
                {afastamentos.map((a) => (
                  <li key={a.id} className="px-4 py-3">
                    <p className="text-sm text-gray-700">
                      <span className="font-semibold">{a.usuario.nome ?? a.usuario.email}</span> pediu{" "}
                      {a.tipo === "ferias" ? "férias" : "congresso"} de {formatarData(a.data_inicio)}
                      {a.data_fim !== a.data_inicio && ` a ${formatarData(a.data_fim)}`}.
                    </p>
                    {a.observacao && <p className="text-xs text-gray-400 mt-1">{a.observacao}</p>}
                    <div className="flex gap-2 mt-2">
                      <button
                        type="button"
                        disabled={processando === a.id}
                        onClick={() => responderAfastamento(a.id, true)}
                        className="flex-1 bg-brand-700 hover:bg-brand-800 text-white text-xs font-semibold py-1.5 rounded-lg transition-colors disabled:opacity-60"
                      >
                        Aprovar
                      </button>
                      <button
                        type="button"
                        disabled={processando === a.id}
                        onClick={() => responderAfastamento(a.id, false)}
                        className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold py-1.5 rounded-lg transition-colors disabled:opacity-60"
                      >
                        Recusar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              {pendentes.length > 0 && (
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 pt-3 pb-1">
                  Trocas
                </p>
              )}
            </>
          )}

          {total === 0 ? (
            <p className="text-sm text-gray-400 px-4 py-4">Nenhuma solicitação pendente.</p>
          ) : pendentes.length === 0 ? null : (
            <ul className="divide-y divide-gray-100">
              {pendentes.map((t) => (
                <li key={t.id} className="px-4 py-3">
                  <p className="text-sm text-gray-700">
                    {t.respondenteId === t.usuarioSaida.id ? (
                      <>
                        <span className="font-semibold">{t.usuarioEntrada.nome ?? t.usuarioEntrada.email}</span> pediu a
                        sua vaga
                      </>
                    ) : (
                      <>
                        <span className="font-semibold">{t.solicitadoPor.nome ?? t.solicitadoPor.email}</span> quer colocar
                        você no lugar de <span className="font-semibold">{t.usuarioSaida.nome ?? t.usuarioSaida.email}</span>
                      </>
                    )}
                    {t.horaInicio && t.horaFim && (
                      <> só das <span className="font-semibold">{formatarIntervalo(t.horaInicio, t.horaFim).replace("–", " às ")}</span></>
                    )}{" "}
                    no plantão <span className="font-semibold">{t.plantao.titulo}</span>.
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(`${t.plantao.data}T00:00:00`).toLocaleDateString("pt-BR")} ·{" "}
                    {t.plantao.hora_inicio.slice(0, 5)}-{t.plantao.hora_fim.slice(0, 5)}
                  </p>
                  <div className="flex gap-2 mt-2">
                    <button
                      type="button"
                      disabled={processando === t.id}
                      onClick={() => responder(t.id, true)}
                      className="flex-1 bg-brand-700 hover:bg-brand-800 text-white text-xs font-semibold py-1.5 rounded-lg transition-colors disabled:opacity-60"
                    >
                      Aceitar
                    </button>
                    <button
                      type="button"
                      disabled={processando === t.id}
                      onClick={() => responder(t.id, false)}
                      className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold py-1.5 rounded-lg transition-colors disabled:opacity-60"
                    >
                      Recusar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
