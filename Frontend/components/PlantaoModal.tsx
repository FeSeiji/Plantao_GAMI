"use client"

import React, { useEffect, useState } from "react"
import SiglaBadge from "./SiglaBadge"
import { EVENTO_TROCAS_ATUALIZADAS } from "./NotificacaoTrocaSino"

type Pessoa = {
  id: string
  nome?: string | null
  email?: string | null
  sigla?: string | null
}

type TrocaPendente = {
  id: string
  solicitadoEm: string
  usuarioEntrada: Pessoa
  solicitadoPor: Pessoa
}

type TrocaHistorico = {
  id: string
  status: "pendente" | "aceita" | "recusada"
  solicitadoEm: string
  respondidoEm: string | null
  usuarioSaida: Pessoa
  usuarioEntrada: Pessoa
  solicitadoPor: Pessoa
}

type Usuario = {
  id: string
  nome?: string | null
  email?: string | null
  sigla?: string | null
  coordenador?: boolean
  posicao?: number | null
  trocaPendente?: TrocaPendente | null
}

type Plantao = {
  id: string
  titulo: string
  descricao: string | null
  data: string
  hora_inicio: string
  hora_fim: string
  tipo: "plantonista" | "socio"
  usuarios: Usuario[]
}

type Props = {
  plantao: Plantao
  podeEditar: boolean
  onClose: () => void
  onUpdated: () => void
}

const POSICOES = [1, 2, 3, 4, 5, 6, 7]

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

  const [historico, setHistorico] = useState<TrocaHistorico[]>([])
  const [trocandoId, setTrocandoId] = useState<string | null>(null)
  const [buscaTroca, setBuscaTroca] = useState("")
  const [resultadosTroca, setResultadosTroca] = useState<Usuario[]>([])
  const [buscandoTroca, setBuscandoTroca] = useState(false)
  const [meuId, setMeuId] = useState<string | null>(null)

  const ehSocio = plantao.tipo === "socio"

  useEffect(() => {
    setMeuId(localStorage.getItem("userId"))
  }, [])

  useEffect(() => {
    const token = localStorage.getItem("token")
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/plantoes/${plantao.id}/trocas`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) return
        const data = await res.json()
        setHistorico(data)
      })
      .catch(() => {})
  }, [plantao.id])

  useEffect(() => {
    const termo = buscaTroca.trim()

    if (!termo || !trocandoId) {
      setResultadosTroca([])
      setBuscandoTroca(false)
      return
    }

    setBuscandoTroca(true)
    const timeoutId = setTimeout(() => {
      const token = localStorage.getItem("token")
      const params = new URLSearchParams({
        search: termo,
        role: "anestesita_plantonista,anestesita_socio",
        data: plantao.data,
        horaInicio: plantao.hora_inicio,
        horaFim: plantao.hora_fim,
      })
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/users?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(async (res) => {
          const resultado = await res.json()
          if (res.ok) setResultadosTroca(resultado)
        })
        .catch(() => {})
        .finally(() => setBuscandoTroca(false))
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [buscaTroca, trocandoId])

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
      const params = new URLSearchParams({
        search: termo,
        role: "anestesita_plantonista,anestesita_socio",
        data: plantao.data,
        horaInicio: plantao.hora_inicio,
        horaFim: plantao.hora_fim,
      })
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
  }, [busca, ehSocio])

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
    setTrocandoId(null)
    setBuscaTroca("")
  }

  async function solicitarTroca(usuarioSaidaId: string, usuarioEntrada: Usuario) {
    setError("")
    setTrocandoId(null)
    setBuscaTroca("")
    setResultadosTroca([])

    try {
      const token = localStorage.getItem("token")
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/plantoes/${plantao.id}/trocas`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ usuario_saida: usuarioSaidaId, usuario_entrada: usuarioEntrada.id }),
      })

      const result = await res.json()

      if (!res.ok) {
        throw new Error(result.error ?? "Não foi possível solicitar a troca.")
      }

      setSelecionados((prev) =>
        prev.map((u) =>
          u.id === usuarioSaidaId
            ? {
                ...u,
                trocaPendente: {
                  id: result.id,
                  solicitadoEm: result.solicitadoEm,
                  usuarioEntrada: result.usuarioEntrada,
                  solicitadoPor: result.solicitadoPor,
                },
              }
            : u
        )
      )
      setHistorico((prev) => [result, ...prev])
      window.dispatchEvent(new Event(EVENTO_TROCAS_ATUALIZADAS))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível solicitar a troca.")
    }
  }

  async function responderTrocaAqui(trocaId: string, usuarioSaidaId: string, aceitar: boolean) {
    setError("")

    try {
      const token = localStorage.getItem("token")
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/plantoes/trocas/${trocaId}/${aceitar ? "aceitar" : "recusar"}`,
        {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}` },
        }
      )

      const result = await res.json()

      if (!res.ok) {
        throw new Error(result.error ?? "Não foi possível responder a essa solicitação.")
      }

      setSelecionados((prev) =>
        prev.map((u) => {
          if (u.id !== usuarioSaidaId) return u
          if (!aceitar) return { ...u, trocaPendente: null }
          return { ...result.usuarioEntrada, coordenador: u.coordenador, posicao: u.posicao, trocaPendente: null }
        })
      )
      setHistorico((prev) => prev.map((h) => (h.id === trocaId ? result : h)))
      window.dispatchEvent(new Event(EVENTO_TROCAS_ATUALIZADAS))
      onUpdated()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível responder a essa solicitação.")
    }
  }

  function proximaPosicaoLivre(atual: Usuario[]) {
    const ocupadas = new Set(atual.map((u) => u.posicao))
    return POSICOES.find((p) => !ocupadas.has(p)) ?? POSICOES[0]
  }

  async function adicionarUsuario(usuario: Usuario) {
    setBusca("")
    setResultados([])
    setError("")

    if (selecionados.some((u) => u.id === usuario.id)) return
    if (ehSocio && selecionados.length >= 7) return

    const posicao = ehSocio ? proximaPosicaoLivre(selecionados) : null
    const anterior = selecionados
    setSelecionados((prev) => [...prev, { ...usuario, posicao, coordenador: false }])

    try {
      const token = localStorage.getItem("token")
      const body = ehSocio ? { fila: [{ usuario_id: usuario.id, posicao }] } : { usuarios: [usuario.id] }

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/plantoes/${plantao.id}/usuarios`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const result = await res.json()
        throw new Error(result.error ?? "Não foi possível adicionar o médico.")
      }

      onUpdated()
    } catch (err) {
      setSelecionados(anterior)
      setError(err instanceof Error ? err.message : "Não foi possível adicionar o médico.")
    }
  }

  async function alterarPosicao(id: string, novaPosicao: number) {
    setError("")
    const anterior = selecionados
    setSelecionados((prev) => prev.map((u) => (u.id === id ? { ...u, posicao: novaPosicao } : u)))

    try {
      const token = localStorage.getItem("token")
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/plantoes/${plantao.id}/usuarios`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ fila: [{ usuario_id: id, posicao: novaPosicao }] }),
      })

      if (!res.ok) {
        const result = await res.json()
        throw new Error(result.error ?? "Não foi possível alterar a posição.")
      }

      onUpdated()
    } catch (err) {
      setSelecionados(anterior)
      setError(err instanceof Error ? err.message : "Não foi possível alterar a posição.")
    }
  }

  async function tornarCoordenador(id: string) {
    setError("")
    const anterior = selecionados
    setSelecionados((prev) => prev.map((u) => ({ ...u, coordenador: u.id === id })))

    try {
      const token = localStorage.getItem("token")
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/plantoes/${plantao.id}/coordenador`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ usuario_id: id }),
      })

      if (!res.ok) {
        const result = await res.json()
        throw new Error(result.error ?? "Não foi possível definir o coordenador.")
      }

      onUpdated()
    } catch (err) {
      setSelecionados(anterior)
      setError(err instanceof Error ? err.message : "Não foi possível definir o coordenador.")
    }
  }

  async function removerUsuario(id: string) {
    setError("")
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
        throw new Error(result.error ?? "Não foi possível remover o médico.")
      }

      onUpdated()
    } catch (err) {
      setSelecionados(anterior)
      setError(err instanceof Error ? err.message : "Não foi possível remover o médico.")
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

  const listaOrdenada = ehSocio
    ? selecionados.slice().sort((a, b) => (a.posicao ?? 0) - (b.posicao ?? 0))
    : selecionados

  const rotuloLista = ehSocio ? "Fila de sócios" : "Equipe"

  function Chip({ u, editavel }: { u: Usuario; editavel: boolean }) {
    const pendente = u.trocaPendente
    const cor = pendente
      ? "bg-amber-100 text-amber-900 ring-1 ring-amber-400"
      : u.coordenador
      ? "bg-brand-700 text-white"
      : "bg-brand-100 text-brand-800"

    const resultadosFiltrados = resultadosTroca.filter(
      (r) => r.id !== u.id && !selecionados.some((s) => s.id === r.id)
    )

    return (
      <div className="flex flex-col gap-1.5">
        <span className={`flex items-center gap-1.5 text-xs font-semibold pl-1.5 pr-2 py-1 rounded-full ${cor}`}>
          {ehSocio && u.posicao != null && (
            <span className="w-4 h-4 rounded-full bg-white/80 text-brand-800 text-[9px] font-bold flex items-center justify-center">
              {u.posicao}
            </span>
          )}
          <SiglaBadge sigla={u.sigla} size="sm" />
          {u.nome ?? u.email ?? u.id}

          {editavel && ehSocio && !pendente && (
            <select
              aria-label="Posição na fila"
              value={u.posicao ?? ""}
              onChange={(e) => alterarPosicao(u.id, Number(e.target.value))}
              className="bg-white text-brand-800 border border-brand-200 rounded-md text-xs px-1 py-0.5"
            >
              {POSICOES.map((p) => (
                <option key={p} value={p} disabled={p !== u.posicao && selecionados.some((o) => o.posicao === p)}>
                  {p}
                </option>
              ))}
            </select>
          )}

          {editavel && !ehSocio && !pendente && (
            <button
              type="button"
              onClick={() => tornarCoordenador(u.id)}
              className={u.coordenador ? "text-white/80" : "text-brand-600 hover:text-brand-900"}
              title="Definir como coordenador"
            >
              {u.coordenador ? "Coordenador" : "Tornar coordenador"}
            </button>
          )}
          {!editavel && !ehSocio && u.coordenador && !pendente && <span className="text-white/90">· Coordenador</span>}

          {pendente && pendente.usuarioEntrada.id === meuId ? (
            <>
              <span className="italic">aguardando seu aceite</span>
              <button
                type="button"
                onClick={() => responderTrocaAqui(pendente.id, u.id, true)}
                className="text-green-600 hover:text-green-800 font-bold"
              >
                Aceitar
              </button>
              <button
                type="button"
                onClick={() => responderTrocaAqui(pendente.id, u.id, false)}
                className="text-red-600 hover:text-red-800 font-bold"
              >
                Recusar
              </button>
            </>
          ) : (
            pendente && (
              <span className="italic">
                aguardando aceite de {pendente.usuarioEntrada.nome ?? pendente.usuarioEntrada.email}
              </span>
            )
          )}

          {editavel && !pendente && (
            <button
              type="button"
              onClick={() => {
                setTrocandoId(trocandoId === u.id ? null : u.id)
                setBuscaTroca("")
              }}
              className={u.coordenador ? "text-white/80 hover:text-white" : "text-brand-600 hover:text-brand-900"}
              title="Substituir por outro médico (precisa de aceite)"
            >
              Trocar
            </button>
          )}

          {editavel && (
            <button
              type="button"
              onClick={() => removerUsuario(u.id)}
              aria-label={`Remover ${u.nome ?? u.email ?? u.id}`}
              className={u.coordenador && !pendente ? "text-white/80 hover:text-white" : "text-brand-600 hover:text-brand-900"}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </span>

        {editavel && trocandoId === u.id && (
          <div className="relative ml-2">
            <div className="flex items-center gap-1.5">
              <input
                autoFocus
                type="text"
                value={buscaTroca}
                onChange={(e) => setBuscaTroca(e.target.value)}
                placeholder="Buscar médico para substituir"
                autoComplete="off"
                className="w-56 border border-gray-300 rounded-lg px-3 py-1.5 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent transition"
              />
              <button
                type="button"
                onClick={() => {
                  setTrocandoId(null)
                  setBuscaTroca("")
                }}
                className="text-gray-400 hover:text-gray-600 text-xs"
              >
                Cancelar
              </button>
            </div>

            {buscaTroca.trim() && (
              <div className="absolute z-20 mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg max-h-32 overflow-y-auto">
                {buscandoTroca ? (
                  <p className="px-3 py-2 text-xs text-gray-400">Buscando...</p>
                ) : resultadosFiltrados.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-gray-400">Nenhum médico encontrado.</p>
                ) : (
                  resultadosFiltrados.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => solicitarTroca(u.id, r)}
                      className="w-full flex items-center gap-2 text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                    >
                      <SiglaBadge sigla={r.sigla} size="sm" />
                      {r.nome ?? r.email ?? r.id}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>
    )
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
          <p className="text-gray-400 text-sm mb-1">
            {new Date(`${plantao.data}T00:00:00`).toLocaleDateString("pt-BR")} · {plantao.hora_inicio.slice(0, 5)} - {plantao.hora_fim.slice(0, 5)}
          </p>
        )}
        {!editando && (
          <p className="text-xs font-semibold text-brand-700 mb-6 uppercase tracking-wide">
            {ehSocio ? "Sócio" : "Plantonista"}
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
                {rotuloLista}
              </label>

              {listaOrdenada.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {listaOrdenada.map((u) => (
                    <Chip key={u.id} u={u} editavel />
                  ))}
                </div>
              )}

              <div className="relative">
                <input
                  id="buscaUsuario"
                  type="text"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder={ehSocio && selecionados.length >= 7 ? "Fila completa (7/7)" : "Buscar por nome ou e-mail"}
                  autoComplete="off"
                  disabled={ehSocio && selecionados.length >= 7}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent transition disabled:bg-gray-50 disabled:text-gray-400"
                />

                {busca.trim() && !(ehSocio && selecionados.length >= 7) && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                    {buscando ? (
                      <p className="px-4 py-2.5 text-sm text-gray-400">Buscando...</p>
                    ) : resultados.filter((u) => !selecionados.some((s) => s.id === u.id)).length === 0 ? (
                      <p className="px-4 py-2.5 text-sm text-gray-400">Nenhum médico encontrado.</p>
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
              <p className="text-sm font-medium text-gray-700 mb-2">{rotuloLista}</p>
              {listaOrdenada.length === 0 ? (
                <p className="text-sm text-gray-400">Nenhum médico atribuído.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {listaOrdenada.map((u) => (
                    <Chip key={u.id} u={u} editavel={false} />
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

        {historico.length > 0 && (
          <div className="mt-6 pt-4 border-t border-gray-100">
            <p className="text-sm font-medium text-gray-700 mb-2">Histórico de trocas</p>
            <ul className="space-y-2 max-h-40 overflow-y-auto">
              {historico.map((t) => {
                const cor =
                  t.status === "pendente" ? "bg-amber-400" : t.status === "aceita" ? "bg-green-500" : "bg-red-500"
                const nomeSaida = t.usuarioSaida.nome ?? t.usuarioSaida.email ?? t.usuarioSaida.id
                const nomeEntrada = t.usuarioEntrada.nome ?? t.usuarioEntrada.email ?? t.usuarioEntrada.id
                const nomeSolicitante = t.solicitadoPor.nome ?? t.solicitadoPor.email ?? t.solicitadoPor.id

                return (
                  <li key={t.id} className="flex items-start gap-2 text-xs text-gray-600">
                    <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${cor}`} />
                    <span>
                      <span className="font-semibold">{nomeSolicitante}</span> solicitou trocar{" "}
                      <span className="font-semibold">{nomeSaida}</span> por{" "}
                      <span className="font-semibold">{nomeEntrada}</span> em{" "}
                      {new Date(t.solicitadoEm).toLocaleString("pt-BR")}
                      {t.status === "pendente" && " — aguardando aceite"}
                      {t.status === "aceita" && t.respondidoEm && (
                        <> — aceita em {new Date(t.respondidoEm).toLocaleString("pt-BR")}</>
                      )}
                      {t.status === "recusada" && t.respondidoEm && (
                        <> — recusada em {new Date(t.respondidoEm).toLocaleString("pt-BR")}</>
                      )}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
