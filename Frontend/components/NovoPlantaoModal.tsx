"use client"

import React, { useEffect, useRef, useState } from "react"
import SiglaBadge from "./SiglaBadge"
import GradeParticipantes, { CelulaGrade } from "./GradeParticipantes"
import { Afastamento, AvisoAfastamento, AvisoIndisponivel } from "./disponibilidade"
import { useViewportVisivel } from "./useViewportVisivel"
import {
  TURNOS,
  Turno,
  VAGAS,
  descreverPosicao,
  ehVagaDeCoordenador,
  formatarTurno,
  horarioDaVaga,
  rotuloPosicaoAbreviado,
  turnoDaPosicao,
  vagasDoTurno,
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
  const [titulo, setTitulo] = useState("")
  const [descricao, setDescricao] = useState("")
  const [data, setData] = useState("")
  const [busca, setBusca] = useState("")
  const [resultados, setResultados] = useState<Usuario[]>([])
  const [buscando, setBuscando] = useState(false)

  // Cada médico numa vaga do dia: Coordenador, Coordenador e 2º a 7º no diurno; intermediário, 1º, 1º, 2º e 3º
  // no noturno. O mesmo médico pode estar nos dois turnos, mas não duas vezes no mesmo
  const [fila, setFila] = useState<FilaItem[]>([])
  const [adicionando, setAdicionando] = useState<Adicionando | null>(null)

  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const termo = busca.trim()

    if (!termo || !adicionando) {
      setResultados([])
      setBuscando(false)
      return
    }

    setBuscando(true)
    const timeoutId = setTimeout(() => {
      const token = localStorage.getItem("token")
      const params = new URLSearchParams({ search: termo, role: "anestesita_plantonista,anestesita_socio" })
      // A data marca quem está de férias/congresso e, com o horário do turno da vaga, esconde quem já está ocupado
      if (data) {
        const horario = horarioDaVaga(data, adicionando.posicao)
        params.set("data", data)
        params.set("horaInicio", horario.hora_inicio)
        params.set("horaFim", horario.hora_fim)
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
  }, [busca, data, adicionando])

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

  // O médico já está em outra vaga desse turno (no formulário)
  function noTurno(usuarioId: string, turno: Turno, ignorarPosicao?: number) {
    return fila.some((f) => f.usuario.id === usuarioId && f.posicao !== ignorarPosicao && turnoDaPosicao(f.posicao) === turno)
  }

  function selecionarUsuario(usuario: Usuario) {
    const alvo = adicionando
    abrirBusca(null)
    if (!alvo) return

    const posicao = alvo.posicao
    setFila((prev) => {
      if (prev.some((f) => f.posicao === posicao)) return prev
      if (prev.some((f) => f.usuario.id === usuario.id && turnoDaPosicao(f.posicao) === turnoDaPosicao(posicao))) return prev
      return [...prev, { usuario, posicao }]
    })
  }

  function removerDaFila(posicao: number) {
    setFila((prev) => prev.filter((f) => f.posicao !== posicao))
  }

  function alterarPosicao(posicao: number, novaPosicao: number) {
    setFila((prev) => prev.map((f) => (f.posicao === posicao ? { ...f, posicao: novaPosicao } : f)))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    if (fila.length === 0) {
      setError("Coloque pelo menos um médico no plantão.")
      return
    }

    setLoading(true)

    try {
      const token = localStorage.getItem("token")
      const body = {
        titulo,
        descricao: descricao || undefined,
        data,
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

  // Quem já está no turno da vaga que abriu a busca não aparece nos resultados
  const turnoBusca = adicionando ? turnoDaPosicao(adicionando.posicao) : null
  const resultadosLivres = resultados.filter((u) => !turnoBusca || !noTurno(u.id, turnoBusca))

  function celulasDoTurno(turno: Turno): CelulaGrade[] {
    return vagasDoTurno(turno).map((p): CelulaGrade => {
      const f = fila.find((item) => item.posicao === p)
      if (!f) {
        return {
          tipo: "vazia",
          chave: `posicao-${p}`,
          rotulo: rotuloPosicaoAbreviado(p),
          texto: "Vaga livre",
          ativa: adicionando?.posicao === p,
          onClick: () => abrirBusca({ posicao: p }),
        }
      }
      return celulaFila(f)
    })
  }

  // O select lista todas as vagas do dia; fica desabilitada a ocupada e a de um turno em que ele já está
  function celulaFila(f: FilaItem): CelulaGrade {
    return {
      tipo: "medico",
      chave: `posicao-${f.posicao}`,
      pessoa: f.usuario,
      destaque: ehVagaDeCoordenador(f.posicao) ? "coordenador" : undefined,
      rotulo: (
        <select
          aria-label="Vaga"
          value={f.posicao}
          onChange={(e) => alterarPosicao(f.posicao, Number(e.target.value))}
          className="w-full max-w-full bg-white border border-brand-200 rounded-md text-xs px-1 py-0.5"
        >
          {TURNOS.map((t) => (
            <optgroup key={t.valor} label={t.rotulo}>
              {VAGAS.filter((v) => v.turno === t.valor).map((v) => (
                <option
                  key={v.posicao}
                  value={v.posicao}
                  disabled={
                    v.posicao !== f.posicao &&
                    (fila.some((o) => o.posicao === v.posicao) || noTurno(f.usuario.id, t.valor, f.posicao))
                  }
                >
                  {rotuloPosicaoAbreviado(v.posicao)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      ),
      acoes: [{ rotulo: "Remover", perigo: true, onClick: () => removerDaFila(f.posicao) }],
    }
  }

  const rotuloBusca = adicionando ? `Adicionar: ${descreverPosicao(adicionando.posicao)}` : ""

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
          <p className="text-gray-400 text-sm mb-4 sm:mb-6">Defina o dia e quem fica em cada vaga do diurno e do noturno.</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 sm:px-8 pb-4 space-y-4">
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
                placeholder="Plantão Centro Cirúrgico"
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

            <div className="space-y-4">
              {TURNOS.map((t) => (
                <div key={t.valor}>
                  <p className="block text-sm font-medium text-gray-700 mb-1">
                    {t.rotulo} <span className="font-normal text-gray-400">· {formatarTurno(t.valor)}</span>
                  </p>
                  <GradeParticipantes celulas={celulasDoTurno(t.valor)} />
                  {/* A busca aparece logo abaixo da lista do turno da vaga que a abriu */}
                  {adicionando && turnoBusca === t.valor && (
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
                          ) : resultadosLivres.length === 0 ? (
                            <p className="px-4 py-2.5 text-sm text-gray-400">Nenhum médico encontrado.</p>
                          ) : (
                            resultadosLivres
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
                </div>
              ))}

              <p className="text-xs text-gray-400 mt-1">
                Clique em uma vaga para preenchê-la e em um médico para ver as opções. Pelo menos um coordenador é
                obrigatório, e o mesmo médico pode estar no diurno e no noturno.
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
