"use client"

import React, { useEffect, useRef, useState } from "react"
import SiglaBadge from "./SiglaBadge"
import GradeParticipantes, { CelulaGrade } from "./GradeParticipantes"
import { Afastamento, AvisoAfastamento, AvisoIndisponivel } from "./disponibilidade"
import { useViewportVisivel } from "./useViewportVisivel"
import {
  descreverPosicao,
  ehNoturno,
  ehPosicaoDeCoordenador,
  posicoesDoPlantao,
  rotuloPosicao,
  rotuloPosicaoCurto,
} from "./posicoes"
import { apiFetch } from "./sessao"

type Usuario = {
  id: string
  nome?: string
  email?: string
  sigla?: string
  dias_disponiveis?: number[] | null
  afastamento?: Afastamento | null
}

type Tipo = "plantonista" | "socio"

type FilaItem = {
  usuario: Usuario
  posicao: number
}

// Qual vaga abriu a busca
type Adicionando = { posicao: number }

type Props = {
  onClose: () => void
  onCreated: () => void
}


export default function NovoPlantaoModal({ onClose, onCreated }: Props) {
  const viewport = useViewportVisivel()
  const buscaRef = useRef<HTMLDivElement>(null)
  const [tipo, setTipo] = useState<Tipo>("plantonista")
  const [titulo, setTitulo] = useState("")
  const [descricao, setDescricao] = useState("")
  const [data, setData] = useState("")
  const [horaInicio, setHoraInicio] = useState("")
  const [horaFim, setHoraFim] = useState("")
  const [busca, setBusca] = useState("")
  const [resultados, setResultados] = useState<Usuario[]>([])
  const [buscando, setBuscando] = useState(false)

  // Fila do sócio ou equipe do plantonista: cada médico numa vaga
  const [fila, setFila] = useState<FilaItem[]>([])
  // Plantonista: Coordenador, Coordenador, 2º a 7º. Sócio: depende do horário — diurno 1º a 7º + intermediário;
  // noturno (19h em diante) 1º, 1º, 2º, 3º + intermediário
  const noturno = tipo === "socio" && horaInicio !== "" && ehNoturno(horaInicio)
  const posicoesDaFila = posicoesDoPlantao(tipo, horaInicio || "00:00")
  const foraDaFila = fila.filter((f) => !posicoesDaFila.includes(f.posicao))
  const [adicionando, setAdicionando] = useState<Adicionando | null>(null)

  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [podeCriarSocio, setPodeCriarSocio] = useState(true)

  useEffect(() => {
    try {
      const roles: string[] = JSON.parse(localStorage.getItem("roles") ?? "[]")
      setPodeCriarSocio(!(roles.includes("anestesita_plantonista") && !roles.includes("anestesita_socio")))
    } catch {
      setPodeCriarSocio(true)
    }
  }, [])

  useEffect(() => {
    const termo = busca.trim()

    if (!termo) {
      setResultados([])
      setBuscando(false)
      return
    }

    // Em plantão de plantonista, sócios só entram nas vagas de coordenador
    const vagaDeMembro = tipo === "plantonista" && !ehPosicaoDeCoordenador(tipo, adicionando?.posicao)
    const role = vagaDeMembro ? "anestesita_plantonista" : "anestesita_plantonista,anestesita_socio"

    setBuscando(true)
    const timeoutId = setTimeout(() => {
      const token = localStorage.getItem("token")
      const params = new URLSearchParams({ search: termo, role })
      // Só a data já basta para marcar quem está de férias/congresso; o conflito de horário precisa das horas
      if (data) params.set("data", data)
      if (data && horaInicio && horaFim) {
        params.set("horaInicio", horaInicio)
        params.set("horaFim", horaFim)
      }
      apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/users?${params}`, {
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
  }, [busca, tipo, data, horaInicio, horaFim, adicionando])

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
    setFila([])
    abrirBusca(null)
  }

  function abrirBusca(alvo: Adicionando | null) {
    setAdicionando(alvo)
    setBusca("")
    setResultados([])
  }

  // Com o teclado aberto sobra pouco espaço: leva a busca para o topo da área rolável,
  // deixando os resultados logo abaixo e visíveis. Espera o teclado terminar de abrir.
  function rolarBuscaParaTopo() {
    setTimeout(() => buscaRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }), 300)
  }

  function selecionarUsuario(usuario: Usuario) {
    const alvo = adicionando
    abrirBusca(null)
    if (!alvo) return

    const posicao = alvo.posicao
    setFila((prev) => {
      if (prev.some((f) => f.usuario.id === usuario.id || f.posicao === posicao)) return prev
      return [...prev, { usuario, posicao }]
    })
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

    if (tipo === "plantonista" && !fila.some((f) => ehPosicaoDeCoordenador(tipo, f.posicao))) {
      setError("Coloque um médico numa das vagas de coordenador.")
      return
    }
    if (fila.length === 0) {
      setError("Adicione ao menos um médico à fila.")
      return
    }
    if (foraDaFila.length > 0) {
      setError("Há médicos em vagas que não existem nesse horário. Mude a posição deles ou remova-os.")
      return
    }

    setLoading(true)

    try {
      const token = localStorage.getItem("token")
      const body = {
        titulo,
        descricao: descricao || undefined,
        data,
        hora_inicio: horaInicio,
        hora_fim: horaFim,
        tipo,
        fila: fila.map((f) => ({ usuario_id: f.usuario.id, posicao: f.posicao })),
      }

      const res = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/plantoes`, {
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

  const jaSelecionados = fila.map((f) => f.usuario.id)

  const celulas: CelulaGrade[] = [
    ...posicoesDaFila.map((p): CelulaGrade => {
      const f = fila.find((item) => item.posicao === p)
      if (!f) {
        return {
          tipo: "vazia",
          chave: `posicao-${p}`,
          rotulo: rotuloPosicao(p, tipo),
          texto: "Vaga",
          ativa: adicionando?.posicao === p,
          onClick: () => abrirBusca({ posicao: p }),
        }
      }
      return celulaFila(f)
    }),
    // Mudou o horário (diurno <-> noturno) e a vaga dele deixou de existir: aparece no fim para ser realocado
    ...foraDaFila.map(celulaFila),
  ]

  function celulaFila(f: FilaItem): CelulaGrade {
    const opcoes = posicoesDaFila.includes(f.posicao) ? posicoesDaFila : [f.posicao, ...posicoesDaFila]
    return {
      tipo: "medico",
      chave: f.usuario.id,
      pessoa: f.usuario,
      destaque: ehPosicaoDeCoordenador(tipo, f.posicao) ? "coordenador" : undefined,
      rotulo: (
        <select
          aria-label="Posição na fila"
          value={f.posicao}
          onChange={(e) => alterarPosicao(f.usuario.id, Number(e.target.value))}
          className="bg-white border border-brand-200 rounded-md text-xs px-1 py-0.5"
        >
          {opcoes.map((op) => (
            <option
              key={op}
              value={op}
              disabled={!posicoesDaFila.includes(op) || (op !== f.posicao && fila.some((o) => o.posicao === op))}
            >
              {rotuloPosicaoCurto(op, tipo)}
            </option>
          ))}
        </select>
      ),
      acoes: [{ rotulo: "Remover", perigo: true, onClick: () => removerDaFila(f.usuario.id) }],
    }
  }

  const rotuloBusca = adicionando ? `Adicionar: ${descreverPosicao(adicionando.posicao, tipo)}` : ""

  return (
    <div
      className="fixed inset-x-0 top-0 z-50 flex sm:items-center justify-center sm:px-4 sm:py-8"
      style={{ height: viewport ? viewport.altura : "100dvh", transform: viewport ? `translateY(${viewport.topo}px)` : undefined }}
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* No celular ocupa a tela toda; cabeçalho e botões ficam fixos e só o meio rola */}
      <div className="relative bg-white sm:rounded-2xl shadow-xl w-full sm:max-w-lg h-full sm:h-auto sm:max-h-full flex flex-col">
        <div className="shrink-0 px-5 pt-5 sm:px-8 sm:pt-8">
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
          <p className="text-gray-400 text-sm mb-4 sm:mb-6">Defina o dia, o horário e quem participa.</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 sm:px-8 pb-4 space-y-4">
            {podeCriarSocio && (
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
            )}

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
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-base sm:text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent transition"
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
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-base sm:text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent transition"
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
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-base sm:text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent transition"
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
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-base sm:text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent transition"
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
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-base sm:text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent transition"
                />
              </div>
            </div>

            <div>
              <p className="block text-sm font-medium text-gray-700 mb-1">
                {tipo === "plantonista" ? "Equipe" : noturno ? "Fila de sócios · noturno" : "Fila de sócios"}
              </p>

              <GradeParticipantes celulas={celulas} />

              {foraDaFila.length > 0 && (
                <p className="mt-2 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  {noturno ? "No plantão noturno a fila é 1º, 1º, 2º, 3º e intermediário." : "No plantão diurno a fila vai do 1º ao 7º, mais o intermediário."}{" "}
                  Mude a posição de {foraDaFila.map((f) => f.usuario.nome ?? f.usuario.email).join(", ")} ou remova.
                </p>
              )}

              {adicionando && (
                <div ref={buscaRef} className="scroll-mt-2 mt-3">
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="buscaMedico" className="text-xs font-semibold text-brand-700">
                      {rotuloBusca}
                    </label>
                    <button
                      type="button"
                      onClick={() => abrirBusca(null)}
                      className="text-xs text-gray-400 hover:text-gray-600"
                    >
                      Cancelar
                    </button>
                  </div>
                  <input
                    id="buscaMedico"
                    autoFocus
                    onFocus={rolarBuscaParaTopo}
                    type="text"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar por nome ou e-mail"
                    autoComplete="off"
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-base sm:text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent transition"
                  />

                  {busca.trim() && (
                    <div className="mt-1 w-full bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
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
                              disabled={!!u.afastamento}
                              className="w-full flex items-center gap-2 text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
                            >
                              <SiglaBadge sigla={u.sigla} size="sm" />
                              <span className="min-w-0 truncate">{u.nome ?? u.email ?? u.id}</span>
                              {u.afastamento ? (
                                <AvisoAfastamento afastamento={u.afastamento} />
                              ) : (
                                <AvisoIndisponivel dias={u.dias_disponiveis} data={data} />
                              )}
                            </button>
                          ))
                      )}
                    </div>
                  )}
                </div>
              )}

              <p className="text-xs text-gray-400 mt-1">
                {tipo === "plantonista"
                  ? "Clique em uma vaga para preenchê-la e em um médico para ver as opções. Pelo menos um coordenador é obrigatório, e sócios só entram como coordenador."
                  : "Clique em uma vaga para preenchê-la e em um médico para ver as opções."}
              </p>
            </div>

            {error && (
              <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
          </div>

          <div className="shrink-0 flex gap-3 border-t border-gray-100 px-5 py-4 sm:px-8 sm:pb-8 sm:border-0 sm:pt-2">
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
