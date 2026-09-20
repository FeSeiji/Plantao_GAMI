"use client"

import React, { useEffect, useState } from "react"
import SiglaBadge from "./SiglaBadge"

type Usuario = {
  id: string
  nome?: string | null
  email?: string | null
  sigla?: string | null
}

type Plantao = {
  id: string
  titulo: string
  descricao: string | null
  data: string
  hora_inicio: string
  hora_fim: string
  usuarios: Usuario[]
}

type Props = {
  plantao: Plantao
  podeEditar: boolean
  onClose: () => void
  onUpdated: () => void
}

export default function PlantaoModal({ plantao, podeEditar, onClose, onUpdated }: Props) {
  const [editando, setEditando] = useState(false)

  const [titulo, setTitulo] = useState(plantao.titulo)
  const [descricao, setDescricao] = useState(plantao.descricao ?? "")
  const [data, setData] = useState(plantao.data)
  const [horaInicio, setHoraInicio] = useState(plantao.hora_inicio.slice(0, 5))
  const [horaFim, setHoraFim] = useState(plantao.hora_fim.slice(0, 5))

  const [selecionados, setSelecionados] = useState<Usuario[]>(plantao.usuarios)
  const [busca, setBusca] = useState("")
  const [resultados, setResultados] = useState<Usuario[]>([])
  const [buscando, setBuscando] = useState(false)

  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const termo = busca.trim()

    if (!termo) {
      setResultados([])
      setBuscando(false)
      return
    }

    setBuscando(true)
    const timeoutId = setTimeout(() => {
      const token = localStorage.getItem("token")
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/users?search=${encodeURIComponent(termo)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(async (res) => {
          const data = await res.json()
          if (res.ok) setResultados(data)
        })
        .catch(() => {})
        .finally(() => setBuscando(false))
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [busca])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }

    document.body.style.overflow = "hidden"
    document.addEventListener("keydown", handleKeyDown)

    return () => {
      document.body.style.overflow = ""
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [onClose])

  function cancelarEdicao() {
    setTitulo(plantao.titulo)
    setDescricao(plantao.descricao ?? "")
    setData(plantao.data)
    setHoraInicio(plantao.hora_inicio.slice(0, 5))
    setHoraFim(plantao.hora_fim.slice(0, 5))
    setError("")
    setEditando(false)
  }

  async function adicionarUsuario(usuario: Usuario) {
    setBusca("")
    setResultados([])

    if (selecionados.some((u) => u.id === usuario.id)) return

    const anterior = selecionados
    setSelecionados((prev) => [...prev, usuario])

    try {
      const token = localStorage.getItem("token")
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/plantoes/${plantao.id}/usuarios`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ usuarios: [usuario.id] }),
      })

      if (!res.ok) {
        const result = await res.json()
        throw new Error(result.error ?? "Não foi possível adicionar o usuário.")
      }

      onUpdated()
    } catch (err) {
      setSelecionados(anterior)
      setError(err instanceof Error ? err.message : "Não foi possível adicionar o usuário.")
    }
  }

  async function removerUsuario(id: string) {
    const anterior = selecionados
    setSelecionados((prev) => prev.filter((u) => u.id !== id))

    try {
      const token = localStorage.getItem("token")
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/plantoes/${plantao.id}/usuarios/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!res.ok && res.status !== 204) {
        const result = await res.json().catch(() => ({}))
        throw new Error(result.error ?? "Não foi possível remover o usuário.")
      }

      onUpdated()
    } catch (err) {
      setSelecionados(anterior)
      setError(err instanceof Error ? err.message : "Não foi possível remover o usuário.")
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const token = localStorage.getItem("token")
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/plantoes/${plantao.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          titulo,
          descricao: descricao || null,
          data,
          hora_inicio: horaInicio,
          hora_fim: horaFim,
        }),
      })

      const result = await res.json()

      if (!res.ok) {
        setError(result.error ?? "Não foi possível salvar as alterações.")
        return
      }

      onUpdated()
      setEditando(false)
    } catch {
      setError("Não foi possível conectar ao servidor.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-full overflow-y-auto p-6 sm:p-8">
        <div className="flex items-start justify-between mb-1">
          <h1 className="text-xl font-bold text-gray-800">
            {editando ? "Editar plantão" : plantao.titulo}
          </h1>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="text-gray-400 hover:text-gray-600 p-1 -mr-1 -mt-1"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {!editando && (
          <p className="text-gray-400 text-sm mb-6">
            {new Date(`${plantao.data}T00:00:00`).toLocaleDateString("pt-BR")} · {plantao.hora_inicio.slice(0, 5)} - {plantao.hora_fim.slice(0, 5)}
          </p>
        )}

        {editando ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="titulo" className="block text-sm font-medium text-gray-700 mb-1">
                Título
              </label>
              <input
                id="titulo"
                type="text"
                required
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent transition"
              />
            </div>

            <div>
              <label htmlFor="descricao" className="block text-sm font-medium text-gray-700 mb-1">
                Descrição (opcional)
              </label>
              <textarea
                id="descricao"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                rows={2}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent transition"
              />
            </div>

            <div>
              <label htmlFor="data" className="block text-sm font-medium text-gray-700 mb-1">
                Dia
              </label>
              <input
                id="data"
                type="date"
                required
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent transition"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="horaInicio" className="block text-sm font-medium text-gray-700 mb-1">
                  Início
                </label>
                <input
                  id="horaInicio"
                  type="time"
                  required
                  value={horaInicio}
                  onChange={(e) => setHoraInicio(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent transition"
                />
              </div>
              <div>
                <label htmlFor="horaFim" className="block text-sm font-medium text-gray-700 mb-1">
                  Fim
                </label>
                <input
                  id="horaFim"
                  type="time"
                  required
                  value={horaFim}
                  onChange={(e) => setHoraFim(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent transition"
                />
              </div>
            </div>

            <div>
              <label htmlFor="buscaUsuario" className="block text-sm font-medium text-gray-700 mb-1">
                Usuários atribuídos
              </label>

              {selecionados.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {selecionados.map((u) => (
                    <span
                      key={u.id}
                      className="flex items-center gap-1.5 bg-brand-100 text-brand-800 text-xs font-semibold pl-1.5 pr-2 py-1 rounded-full"
                    >
                      <SiglaBadge sigla={u.sigla} size="sm" />
                      {u.nome ?? u.email ?? u.id}
                      <button
                        type="button"
                        onClick={() => removerUsuario(u.id)}
                        aria-label={`Remover ${u.nome ?? u.email ?? u.id}`}
                        className="text-brand-600 hover:text-brand-900"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className="relative">
                <input
                  id="buscaUsuario"
                  type="text"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por nome ou e-mail"
                  autoComplete="off"
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent transition"
                />

                {busca.trim() && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                    {buscando ? (
                      <p className="px-4 py-2.5 text-sm text-gray-400">Buscando...</p>
                    ) : resultados.filter((u) => !selecionados.some((s) => s.id === u.id)).length === 0 ? (
                      <p className="px-4 py-2.5 text-sm text-gray-400">Nenhum usuário encontrado.</p>
                    ) : (
                      resultados
                        .filter((u) => !selecionados.some((s) => s.id === u.id))
                        .map((u) => (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => adicionarUsuario(u)}
                            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                          >
                            {u.nome ?? u.email ?? u.id}
                          </button>
                        ))
                    )}
                  </div>
                )}
              </div>
            </div>

            {error && (
              <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={cancelarEdicao}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-2.5 rounded-lg text-sm transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-brand-700 hover:bg-brand-800 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? "Salvando..." : "Salvar alterações"}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            {plantao.descricao && <p className="text-sm text-gray-600">{plantao.descricao}</p>}

            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Usuários atribuídos</p>
              {selecionados.length === 0 ? (
                <p className="text-sm text-gray-400">Nenhum usuário atribuído.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {selecionados.map((u) => (
                    <span
                      key={u.id}
                      className="flex items-center gap-1.5 bg-brand-100 text-brand-800 text-xs font-semibold pl-1.5 pr-3 py-1 rounded-full"
                    >
                      <SiglaBadge sigla={u.sigla} size="sm" />
                      {u.nome ?? u.email ?? u.id}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {error && (
              <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            {podeEditar && (
              <button
                type="button"
                onClick={() => setEditando(true)}
                className="w-full bg-brand-700 hover:bg-brand-800 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
              >
                Editar
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
