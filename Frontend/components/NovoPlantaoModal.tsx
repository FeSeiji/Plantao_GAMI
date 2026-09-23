"use client"

import React, { useEffect, useState } from "react"
import SiglaBadge from "./SiglaBadge"

type Usuario = {
  id: string
  nome?: string
  email?: string
  sigla?: string
}

type Tipo = "plantonista" | "socio"

type FilaItem = {
  usuario: Usuario
  posicao: number
}

type Props = {
  onClose: () => void
  onCreated: () => void
}

const POSICOES = [1, 2, 3, 4, 5, 6, 7]

export default function NovoPlantaoModal({ onClose, onCreated }: Props) {
  const [tipo, setTipo] = useState<Tipo>("plantonista")
  const [titulo, setTitulo] = useState("")
  const [descricao, setDescricao] = useState("")
  const [data, setData] = useState("")
  const [horaInicio, setHoraInicio] = useState("")
  const [horaFim, setHoraFim] = useState("")
  const [busca, setBusca] = useState("")
  const [resultados, setResultados] = useState<Usuario[]>([])
  const [buscando, setBuscando] = useState(false)

  const [equipe, setEquipe] = useState<Usuario[]>([])
  const [coordenadorId, setCoordenadorId] = useState<string | null>(null)

  const [fila, setFila] = useState<FilaItem[]>([])

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
      const params = new URLSearchParams({ search: termo, role: "anestesita_plantonista,anestesita_socio" })
      if (data && horaInicio && horaFim) {
        params.set("data", data)
        params.set("horaInicio", horaInicio)
        params.set("horaFim", horaFim)
      }
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/users?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(async (res) => {
          const resultado = await res.json()
          if (res.ok) setResultados(resultado)
        })
        .catch(() => {})
        .finally(() => setBuscando(false))
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [busca, tipo, data, horaInicio, horaFim])

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

  function trocarTipo(novoTipo: Tipo) {
    setTipo(novoTipo)
    setEquipe([])
    setCoordenadorId(null)
    setFila([])
    setBusca("")
    setResultados([])
  }

  function proximaPosicaoLivre(atual: FilaItem[]) {
    const ocupadas = new Set(atual.map((f) => f.posicao))
    return POSICOES.find((p) => !ocupadas.has(p)) ?? POSICOES[0]
  }

  function selecionarUsuario(usuario: Usuario) {
    setBusca("")
    setResultados([])

    if (tipo === "plantonista") {
      setEquipe((prev) => {
        if (prev.some((u) => u.id === usuario.id)) return prev
        const proxima = [...prev, usuario]
        if (!coordenadorId) setCoordenadorId(usuario.id)
        return proxima
      })
    } else {
      setFila((prev) => {
        if (prev.some((f) => f.usuario.id === usuario.id) || prev.length >= 7) return prev
        return [...prev, { usuario, posicao: proximaPosicaoLivre(prev) }]
      })
    }
  }

  function removerDaEquipe(id: string) {
    setEquipe((prev) => prev.filter((u) => u.id !== id))
    if (coordenadorId === id) setCoordenadorId(null)
  }

  function removerDaFila(id: string) {
    setFila((prev) => prev.filter((f) => f.usuario.id !== id))
  }

  function alterarPosicao(id: string, novaPosicao: number) {
    setFila((prev) => prev.map((f) => (f.usuario.id === id ? { ...f, posicao: novaPosicao } : f)))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    if (tipo === "plantonista" && !coordenadorId) {
      setError("Selecione um médico coordenador para a equipe.")
      return
    }
    if (tipo === "socio" && fila.length === 0) {
      setError("Adicione ao menos um médico à fila.")
      return
    }

    setLoading(true)

    try {
      const token = localStorage.getItem("token")
      const body =
        tipo === "plantonista"
          ? {
              titulo,
              descricao: descricao || undefined,
              data,
              hora_inicio: horaInicio,
              hora_fim: horaFim,
              tipo,
              usuarios: equipe.map((u) => u.id),
              coordenador_id: coordenadorId,
            }
          : {
              titulo,
              descricao: descricao || undefined,
              data,
              hora_inicio: horaInicio,
              hora_fim: horaFim,
              tipo,
              fila: fila.map((f) => ({ usuario_id: f.usuario.id, posicao: f.posicao })),
            }

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/plantoes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })

      const result = await res.json()

      if (!res.ok) {
        setError(result.error ?? "Não foi possível criar o plantão.")
        return
      }

      onCreated()
      onClose()
    } catch {
      setError("Não foi possível conectar ao servidor.")
    } finally {
      setLoading(false)
    }
  }

  const jaSelecionados = tipo === "plantonista" ? equipe.map((u) => u.id) : fila.map((f) => f.usuario.id)
  const buscaDesabilitada = tipo === "socio" && fila.length >= 7

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-full overflow-y-auto p-6 sm:p-8">
        <div className="flex items-start justify-between mb-1">
          <h1 className="text-xl font-bold text-gray-800">Novo plantão</h1>
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
        <p className="text-gray-400 text-sm mb-6">Defina o dia, o horário e quem participa.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de plantão</label>
            <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => trocarTipo("plantonista")}
                className={`flex-1 text-xs font-semibold px-2.5 py-1.5 rounded-md transition-colors ${
                  tipo === "plantonista" ? "bg-white text-brand-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Plantonista
              </button>
              <button
                type="button"
                onClick={() => trocarTipo("socio")}
                className={`flex-1 text-xs font-semibold px-2.5 py-1.5 rounded-md transition-colors ${
                  tipo === "socio" ? "bg-white text-brand-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Sócio
              </button>
            </div>
          </div>

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
              placeholder="Plantão UTI - noturno"
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent transition"
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
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent transition"
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
            <label htmlFor="buscaMedico" className="block text-sm font-medium text-gray-700 mb-1">
              {tipo === "plantonista" ? "Equipe" : "Fila de sócios"}
            </label>

            {tipo === "plantonista" ? (
              equipe.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {equipe.map((u) => (
                    <span
                      key={u.id}
                      className={`flex items-center gap-1.5 text-xs font-semibold pl-1.5 pr-2 py-1 rounded-full ${
                        coordenadorId === u.id ? "bg-brand-700 text-white" : "bg-brand-100 text-brand-800"
                      }`}
                    >
                      <SiglaBadge sigla={u.sigla} size="sm" />
                      {u.nome ?? u.email ?? u.id}
                      <button
                        type="button"
                        onClick={() => setCoordenadorId(u.id)}
                        className={coordenadorId === u.id ? "text-white/80" : "text-brand-600 hover:text-brand-900"}
                        title="Definir como coordenador"
                      >
                        {coordenadorId === u.id ? "Coordenador" : "Tornar coordenador"}
                      </button>
                      <button
                        type="button"
                        onClick={() => removerDaEquipe(u.id)}
                        aria-label={`Remover ${u.nome ?? u.email ?? u.id}`}
                        className={coordenadorId === u.id ? "text-white/80 hover:text-white" : "text-brand-600 hover:text-brand-900"}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </span>
                  ))}
                </div>
              )
            ) : (
              fila.length > 0 && (
                <div className="flex flex-col gap-2 mb-2">
                  {fila
                    .slice()
                    .sort((a, b) => a.posicao - b.posicao)
                    .map((f) => (
                      <div
                        key={f.usuario.id}
                        className="flex items-center gap-2 bg-brand-100 text-brand-800 text-xs font-semibold pl-1.5 pr-2 py-1 rounded-full"
                      >
                        <SiglaBadge sigla={f.usuario.sigla} size="sm" />
                        <span className="flex-1">{f.usuario.nome ?? f.usuario.email ?? f.usuario.id}</span>
                        <label className="sr-only" htmlFor={`posicao-${f.usuario.id}`}>
                          Posição na fila
                        </label>
                        <select
                          id={`posicao-${f.usuario.id}`}
                          value={f.posicao}
                          onChange={(e) => alterarPosicao(f.usuario.id, Number(e.target.value))}
                          className="bg-white border border-brand-200 rounded-md text-xs px-1.5 py-0.5"
                        >
                          {POSICOES.map((p) => (
                            <option key={p} value={p} disabled={p !== f.posicao && fila.some((o) => o.posicao === p)}>
                              {p}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => removerDaFila(f.usuario.id)}
                          aria-label={`Remover ${f.usuario.nome ?? f.usuario.email ?? f.usuario.id}`}
                          className="text-brand-600 hover:text-brand-900"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    ))}
                </div>
              )
            )}

            <div className="relative">
              <input
                id="buscaMedico"
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder={buscaDesabilitada ? "Fila completa (7/7)" : "Buscar por nome ou e-mail"}
                autoComplete="off"
                disabled={buscaDesabilitada}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent transition disabled:bg-gray-50 disabled:text-gray-400"
              />

              {busca.trim() && !buscaDesabilitada && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                  {buscando ? (
                    <p className="px-4 py-2.5 text-sm text-gray-400">Buscando...</p>
                  ) : resultados.filter((u) => !jaSelecionados.includes(u.id)).length === 0 ? (
                    <p className="px-4 py-2.5 text-sm text-gray-400">Nenhum médico encontrado.</p>
                  ) : (
                    resultados
                      .filter((u) => !jaSelecionados.includes(u.id))
                      .map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => selecionarUsuario(u)}
                          className="w-full flex items-center gap-2 text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <SiglaBadge sigla={u.sigla} size="sm" />
                          {u.nome ?? u.email ?? u.id}
                        </button>
                      ))
                  )}
                </div>
              )}
            </div>

            <p className="text-xs text-gray-400 mt-1">
              {tipo === "plantonista"
                ? "Clique em \"Tornar coordenador\" para marcar quem coordena a equipe (obrigatório)."
                : "Escolha a posição (1 a 7) de cada médico na fila."}
            </p>
          </div>

          {error && (
            <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-2.5 rounded-lg text-sm transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-brand-700 hover:bg-brand-800 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "Criando..." : "Criar plantão"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
