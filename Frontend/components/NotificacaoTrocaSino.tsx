"use client"

import { useCallback, useEffect, useRef, useState } from "react"

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
  solicitadoPor: Pessoa
  plantao: {
    id: string
    titulo: string
    data: string
    hora_inicio: string
    hora_fim: string
  }
}

const INTERVALO_POLL_MS = 30000
export const EVENTO_TROCAS_ATUALIZADAS = "trocas-atualizadas"

export default function NotificacaoTrocaSino() {
  const [pendentes, setPendentes] = useState<TrocaPendente[]>([])
  const [aberto, setAberto] = useState(false)
  const [processando, setProcessando] = useState<string | null>(null)
  const [error, setError] = useState("")
  const containerRef = useRef<HTMLDivElement>(null)

  const carregar = useCallback(() => {
    const token = localStorage.getItem("token")
    if (!token) return

    fetch(`${process.env.NEXT_PUBLIC_API_URL}/plantoes/trocas/pendentes`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) return
        const data = await res.json()
        setPendentes(data)
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
      const res = await fetch(
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

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-label="Notificações de troca"
        className="relative text-gray-500 hover:text-gray-800 hover:bg-gray-100 p-2 rounded-lg transition-colors"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {pendentes.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center leading-none">
            {pendentes.length > 9 ? "9+" : pendentes.length}
          </span>
        )}
      </button>

      {aberto && (
        <div className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-white border border-gray-200 rounded-xl shadow-lg z-50 max-h-96 overflow-y-auto">
          <p className="text-sm font-semibold text-gray-700 px-4 py-3 border-b border-gray-100">
            Solicitações de troca
          </p>

          {error && (
            <p className="text-red-600 text-xs bg-red-50 border-b border-red-200 px-4 py-2">{error}</p>
          )}

          {pendentes.length === 0 ? (
            <p className="text-sm text-gray-400 px-4 py-4">Nenhuma solicitação pendente.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {pendentes.map((t) => (
                <li key={t.id} className="px-4 py-3">
                  <p className="text-sm text-gray-700">
                    <span className="font-semibold">{t.solicitadoPor.nome ?? t.solicitadoPor.email}</span> quer colocar
                    você no lugar de <span className="font-semibold">{t.usuarioSaida.nome ?? t.usuarioSaida.email}</span> no
                    plantão <span className="font-semibold">{t.plantao.titulo}</span>.
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
