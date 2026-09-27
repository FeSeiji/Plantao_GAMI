"use client"

import React, { useCallback, useEffect, useState } from "react"
import SiglaBadge from "./SiglaBadge"
import GradeParticipantes, { AcaoMenu, CelulaGrade } from "./GradeParticipantes"
import { Afastamento, AvisoAfastamento, AvisoIndisponivel, rotuloAfastamento } from "./disponibilidade"
import ConfirmacaoModal, { Confirmacao } from "./ConfirmacaoModal"
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
  status: "pendente" | "aceita" | "recusada" | "cancelada"
  solicitadoEm: string
  respondidoEm: string | null
  usuarioSaida: Pessoa
  usuarioEntrada: Pessoa
  solicitadoPor: Pessoa
}

type RemocaoHistorico = {
  id: string
  removidoEm: string
  eraCoordenador: boolean
  posicao: number | null
  usuario: Pessoa
  removidoPor: Pessoa
}

type EventoHistorico =
  | { tipo: "troca"; quando: string; troca: TrocaHistorico }
  | { tipo: "remocao"; quando: string; remocao: RemocaoHistorico }

type Usuario = {
  id: string
  nome?: string | null
  email?: string | null
  sigla?: string | null
  coordenador?: boolean
  posicao?: number | null
  trocaPendente?: TrocaPendente | null
  dias_disponiveis?: number[] | null
  afastamento?: Afastamento | null
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

function nomeDe(p: Pessoa) {
  return p.nome ?? p.email ?? p.id
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

  const [historico, setHistorico] = useState<TrocaHistorico[]>([])
  const [remocoes, setRemocoes] = useState<RemocaoHistorico[]>([])
  const [confirmacao, setConfirmacao] = useState<Confirmacao | null>(null)
  const [trocandoId, setTrocandoId] = useState<string | null>(null)
  const [buscaTroca, setBuscaTroca] = useState("")
  const [resultadosTroca, setResultadosTroca] = useState<Usuario[]>([])
  const [buscandoTroca, setBuscandoTroca] = useState(false)
  const [meuId, setMeuId] = useState<string | null>(null)
  // Célula "+" que abriu a busca de adição: a posição da fila (sócio) ou o fim da equipe (plantonista)
  const [adicionando, setAdicionando] = useState<{ posicao?: number } | null>(null)

  const ehSocio = plantao.tipo === "socio"

  useEffect(() => {
    setMeuId(localStorage.getItem("userId"))
  }, [])

  const carregarHistorico = useCallback(() => {
    const token = localStorage.getItem("token")
    const buscar = (caminho: string) =>
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/plantoes/${plantao.id}/${caminho}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then((res) => (res.ok ? res.json() : null))

    buscar("trocas").then((data) => data && setHistorico(data)).catch(() => {})
    buscar("remocoes").then((data) => data && setRemocoes(data)).catch(() => {})
  }, [plantao.id])

  useEffect(() => {
    carregarHistorico()
  }, [carregarHistorico])

  useEffect(() => {
    const termo = buscaTroca.trim()

    if (!termo || !trocandoId) {
      setResultadosTroca([])
      setBuscandoTroca(false)
      return
    }

    // Em plantão de plantonista, sócios só entram no lugar do coordenador
    const saiCoordenador = selecionados.some((u) => u.id === trocandoId && u.coordenador)
    const role = ehSocio || saiCoordenador ? "anestesita_plantonista,anestesita_socio" : "anestesita_plantonista"

    setBuscandoTroca(true)
    const timeoutId = setTimeout(() => {
      const token = localStorage.getItem("token")
      const params = new URLSearchParams({
        search: termo,
        role,
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
  }, [buscaTroca, trocandoId, selecionados, ehSocio])

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
      // Adição em plantão de plantonista é sempre como membro, e sócios só entram como coordenador
      const params = new URLSearchParams({
        search: termo,
        role: ehSocio ? "anestesita_plantonista,anestesita_socio" : "anestesita_plantonista",
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
    abrirAdicao(null)
    abrirTroca(null)
  }

  function abrirAdicao(alvo: { posicao?: number } | null) {
    setAdicionando(alvo)
    setBusca("")
    setResultados([])
    if (alvo) setTrocandoId(null)
  }

  function abrirTroca(id: string | null) {
    setTrocandoId(id)
    setBuscaTroca("")
    setResultadosTroca([])
    if (id) setAdicionando(null)
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

  async function adicionarUsuario(usuario: Usuario) {
    const alvo = adicionando
    abrirAdicao(null)
    setError("")

    if (!alvo || selecionados.some((u) => u.id === usuario.id)) return

    const posicao = ehSocio ? alvo.posicao ?? null : null
    if (ehSocio && (posicao == null || selecionados.some((u) => u.posicao === posicao))) return
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
      carregarHistorico()
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

  const rotuloLista = ehSocio ? "Fila de sócios" : "Equipe"

  function confirmarRemocao(u: Usuario) {
    setConfirmacao({
      titulo: "Remover médico?",
      mensagem: (
        <>
          <p>
            <span className="font-semibold">{nomeDe(u)}</span> será removido deste plantão
            {ehSocio && u.posicao != null ? ` (posição ${u.posicao})` : ""}. A remoção fica registrada no histórico.
          </p>
          {u.trocaPendente && <p className="mt-2 text-amber-700">A troca pendente deste médico também será cancelada.</p>}
        </>
      ),
      rotuloConfirmar: "Remover",
      perigo: true,
      acao: () => removerUsuario(u.id),
    })
  }

  function celulaMedico(u: Usuario, editavel: boolean): CelulaGrade {
    const pendente = u.trocaPendente
    const souConvidado = pendente != null && pendente.usuarioEntrada.id === meuId

    const acoes: AcaoMenu[] = []
    if (editavel) {
      if (!ehSocio && !u.coordenador && !pendente) {
        acoes.push({ rotulo: "Tornar coordenador", onClick: () => tornarCoordenador(u.id) })
      }
      if (!pendente) acoes.push({ rotulo: "Trocar", onClick: () => abrirTroca(u.id) })
      acoes.push({ rotulo: "Remover", perigo: true, onClick: () => confirmarRemocao(u) })
    }

    let rotulo: React.ReactNode = undefined
    if (ehSocio && editavel && !pendente) {
      rotulo = (
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
      )
    } else if (ehSocio) {
      rotulo = u.posicao
    } else if (u.coordenador) {
      rotulo = "Coordenador"
    }

    return {
      tipo: "medico",
      chave: u.id,
      pessoa: u,
      rotulo,
      larga: !ehSocio && u.coordenador,
      // Afastamento (férias/congresso) tem prioridade visual: a gestão precisa resolver essa escala
      destaque: u.afastamento
        ? "indisponivel"
        : pendente
        ? "pendente"
        : !ehSocio && u.coordenador
        ? "coordenador"
        : undefined,
      status:
        u.afastamento || pendente ? (
          <>
            {u.afastamento && <span className="block font-semibold not-italic">Indisponível: {rotuloAfastamento(u.afastamento)}</span>}
            {pendente && (
              <span className="block">
                {souConvidado ? "aguardando seu aceite" : `aguardando aceite de ${nomeDe(pendente.usuarioEntrada)}`}
              </span>
            )}
          </>
        ) : undefined,
      extra: souConvidado && pendente && (
        <div className="flex gap-3 text-xs">
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
        </div>
      ),
      acoes,
    }
  }

  function montarCelulas(editavel: boolean): CelulaGrade[] {
    if (ehSocio) {
      return POSICOES.map((p) => {
        const u = selecionados.find((s) => s.posicao === p)
        if (u) return celulaMedico(u, editavel)
        return {
          tipo: "vazia",
          chave: `posicao-${p}`,
          rotulo: `${p}`,
          texto: "Vaga",
          ativa: adicionando?.posicao === p,
          onClick: editavel ? () => abrirAdicao({ posicao: p }) : undefined,
        }
      })
    }

    const coordenador = selecionados.find((u) => u.coordenador)
    const celulas: CelulaGrade[] = [
      coordenador
        ? celulaMedico(coordenador, editavel)
        : { tipo: "vazia", chave: "coordenador", rotulo: "Coordenador", texto: "Sem coordenador", larga: true },
      ...selecionados.filter((u) => !u.coordenador).map((u) => celulaMedico(u, editavel)),
    ]
    if (editavel) {
      celulas.push({
        tipo: "vazia",
        chave: "adicionar",
        texto: "Adicionar",
        ativa: adicionando != null,
        onClick: () => abrirAdicao({}),
      })
    }
    return celulas
  }

  const usuarioTrocando = selecionados.find((u) => u.id === trocandoId)
  const resultadosTrocaFiltrados = resultadosTroca.filter(
    (r) => r.id !== trocandoId && !selecionados.some((s) => s.id === r.id)
  )

  const eventosHistorico: EventoHistorico[] = [
    ...historico.map((troca) => ({ tipo: "troca" as const, quando: troca.solicitadoEm, troca })),
    ...remocoes.map((remocao) => ({ tipo: "remocao" as const, quando: remocao.removidoEm, remocao })),
  ].sort((a, b) => b.quando.localeCompare(a.quando))

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
              <p className="block text-sm font-medium text-gray-700 mb-2">{rotuloLista}</p>

              <GradeParticipantes celulas={montarCelulas(true)} />

              {adicionando && (
                <div className="relative mt-3">
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="buscaUsuario" className="text-xs font-semibold text-brand-700">
                      {adicionando.posicao != null ? `Adicionar na posição ${adicionando.posicao}` : "Adicionar à equipe"}
                    </label>
                    <button
                      type="button"
                      onClick={() => abrirAdicao(null)}
                      className="text-xs text-gray-400 hover:text-gray-600"
                    >
                      Cancelar
                    </button>
                  </div>
                  <input
                    id="buscaUsuario"
                    autoFocus
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
                        <p className="px-4 py-2.5 text-sm text-gray-400">Nenhum médico encontrado.</p>
                      ) : (
                        resultados
                          .filter((u) => !selecionados.some((s) => s.id === u.id))
                          .map((u) => (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => adicionarUsuario(u)}
                              disabled={!!u.afastamento}
                              className="w-full flex items-center gap-2 text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
                            >
                              <SiglaBadge sigla={u.sigla} size="sm" />
                              <span className="min-w-0 truncate">{nomeDe(u)}</span>
                              {u.afastamento ? (
                                <AvisoAfastamento afastamento={u.afastamento} />
                              ) : (
                                <AvisoIndisponivel dias={u.dias_disponiveis} data={plantao.data} />
                              )}
                            </button>
                          ))
                      )}
                    </div>
                  )}
                </div>
              )}

              {usuarioTrocando && (
                <div className="relative mt-3">
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="buscaTroca" className="text-xs font-semibold text-brand-700">
                      Substituir {nomeDe(usuarioTrocando)}
                      {usuarioTrocando.coordenador ? " (coordenador)" : ""}
                    </label>
                    <button
                      type="button"
                      onClick={() => abrirTroca(null)}
                      className="text-xs text-gray-400 hover:text-gray-600"
                    >
                      Cancelar
                    </button>
                  </div>
                  <input
                    id="buscaTroca"
                    autoFocus
                    type="text"
                    value={buscaTroca}
                    onChange={(e) => setBuscaTroca(e.target.value)}
                    placeholder="Buscar médico para substituir"
                    autoComplete="off"
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent transition"
                  />

                  {buscaTroca.trim() && (
                    <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                      {buscandoTroca ? (
                        <p className="px-4 py-2.5 text-sm text-gray-400">Buscando...</p>
                      ) : resultadosTrocaFiltrados.length === 0 ? (
                        <p className="px-4 py-2.5 text-sm text-gray-400">Nenhum médico encontrado.</p>
                      ) : (
                        resultadosTrocaFiltrados.map((r) => (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() =>
                              setConfirmacao({
                                titulo: "Solicitar troca?",
                                mensagem: (
                                  <p>
                                    Trocar <span className="font-semibold">{nomeDe(usuarioTrocando)}</span> por{" "}
                                    <span className="font-semibold">{nomeDe(r)}</span>
                                    {usuarioTrocando.coordenador ? " (inclusive como coordenador)" : ""}. A troca só vale
                                    depois que {nomeDe(r)} aceitar.
                                  </p>
                                ),
                                rotuloConfirmar: "Solicitar troca",
                                acao: () => solicitarTroca(usuarioTrocando.id, r),
                              })
                            }
                            disabled={!!r.afastamento}
                            className="w-full flex items-center gap-2 text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
                          >
                            <SiglaBadge sigla={r.sigla} size="sm" />
                            <span className="min-w-0 truncate">{nomeDe(r)}</span>
                            {r.afastamento ? (
                              <AvisoAfastamento afastamento={r.afastamento} />
                            ) : (
                              <AvisoIndisponivel dias={r.dias_disponiveis} data={plantao.data} />
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
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
              {!ehSocio && selecionados.length === 0 ? (
                <p className="text-sm text-gray-400">Nenhum médico atribuído.</p>
              ) : (
                <GradeParticipantes celulas={montarCelulas(false)} />
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

        {eventosHistorico.length > 0 && (
          <div className="mt-6 pt-4 border-t border-gray-100">
            <p className="text-sm font-medium text-gray-700 mb-2">Histórico do plantão</p>
            <ul className="space-y-2 max-h-40 overflow-y-auto">
              {eventosHistorico.map((evento) => {
                if (evento.tipo === "remocao") {
                  const r = evento.remocao
                  const papel = r.eraCoordenador ? " (coordenador)" : r.posicao != null ? ` (posição ${r.posicao})` : ""
                  return (
                    <li key={`remocao-${r.id}`} className="flex items-start gap-2 text-xs text-gray-600">
                      <span className="mt-1 w-1.5 h-1.5 rounded-full shrink-0 bg-gray-500" />
                      <span>
                        <span className="font-semibold">{nomeDe(r.removidoPor)}</span> removeu{" "}
                        <span className="font-semibold">{nomeDe(r.usuario)}</span>
                        {papel} em {new Date(r.removidoEm).toLocaleString("pt-BR")}
                      </span>
                    </li>
                  )
                }

                const t = evento.troca
                const cor = {
                  pendente: "bg-amber-400",
                  aceita: "bg-green-500",
                  recusada: "bg-red-500",
                  cancelada: "bg-gray-400",
                }[t.status]

                return (
                  <li key={`troca-${t.id}`} className="flex items-start gap-2 text-xs text-gray-600">
                    <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${cor}`} />
                    <span>
                      <span className="font-semibold">{nomeDe(t.solicitadoPor)}</span> solicitou trocar{" "}
                      <span className="font-semibold">{nomeDe(t.usuarioSaida)}</span> por{" "}
                      <span className="font-semibold">{nomeDe(t.usuarioEntrada)}</span> em{" "}
                      {new Date(t.solicitadoEm).toLocaleString("pt-BR")}
                      {t.status === "pendente" && " — aguardando aceite"}
                      {t.status === "aceita" && t.respondidoEm && (
                        <> — aceita em {new Date(t.respondidoEm).toLocaleString("pt-BR")}</>
                      )}
                      {t.status === "recusada" && t.respondidoEm && (
                        <> — recusada em {new Date(t.respondidoEm).toLocaleString("pt-BR")}</>
                      )}
                      {t.status === "cancelada" && t.respondidoEm && (
                        <> — cancelada em {new Date(t.respondidoEm).toLocaleString("pt-BR")} (médico removido)</>
                      )}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>

      {confirmacao && <ConfirmacaoModal confirmacao={confirmacao} onClose={() => setConfirmacao(null)} />}
    </div>
  )
}
