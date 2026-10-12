"use client"

import React, { useEffect, useState } from "react"
import SiglaBadge from "./SiglaBadge"
import ConfirmacaoModal, { Confirmacao } from "./ConfirmacaoModal"
import { INPUT_CLASS } from "./UsuarioModal"
import { useViewportVisivel } from "./useViewportVisivel"
import { apiFetch } from "./sessao"
import {
  FichaDetalhe,
  MAX_FOTOS,
  MAX_OBSERVACOES,
  Pessoa,
  TIPOS_ANESTESIA,
  TipoAnestesia,
  comprimirImagem,
} from "./fichas"

type Props = {
  // null = nova ficha
  fichaId: string | null
  onClose: () => void
  onSaved: () => void
}

const ROLES_ANESTESISTA = ["anestesita_socio", "anestesita_plantonista"]

const nomeDe = (p: Pessoa) => p.nome ?? p.email ?? p.id

function hojeLocal() {
  return new Date().toLocaleDateString("en-CA")
}

function formatarData(data: string) {
  return new Date(`${data}T00:00:00`).toLocaleDateString("pt-BR")
}

function chamarApi(caminho: string, metodo = "GET", body?: unknown) {
  const token = localStorage.getItem("token")
  return apiFetch(`${process.env.NEXT_PUBLIC_API_URL}${caminho}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
}

export default function FichaModal({ fichaId, onClose, onSaved }: Props) {
  const viewport = useViewportVisivel()
  const criando = fichaId === null

  const [ficha, setFicha] = useState<FichaDetalhe | null>(null)
  const [carregando, setCarregando] = useState(!criando)
  const [editando, setEditando] = useState(criando)

  const [data, setData] = useState(hojeLocal())
  const [horaInicio, setHoraInicio] = useState("")
  const [horaFim, setHoraFim] = useState("")
  const [anestesista, setAnestesista] = useState<Pessoa | null>(null)
  const [tipo, setTipo] = useState<TipoAnestesia | null>(null)
  const [tipoOutro, setTipoOutro] = useState("")
  const [observacoes, setObservacoes] = useState("")
  const [fotosMantidas, setFotosMantidas] = useState<{ caminho: string; url: string }[]>([])
  const [fotosNovas, setFotosNovas] = useState<string[]>([])

  const [busca, setBusca] = useState("")
  const [resultados, setResultados] = useState<Pessoa[]>([])
  const [buscando, setBuscando] = useState(false)

  const [error, setError] = useState("")
  const [salvando, setSalvando] = useState(false)
  const [processandoFoto, setProcessandoFoto] = useState(false)
  const [confirmacao, setConfirmacao] = useState<Confirmacao | null>(null)

  function preencher(f: FichaDetalhe) {
    setData(f.data)
    setHoraInicio(f.hora_inicio.slice(0, 5))
    setHoraFim(f.hora_fim.slice(0, 5))
    setAnestesista(f.anestesista)
    setTipo(f.tipo_anestesia)
    setTipoOutro(f.tipo_outro ?? "")
    setObservacoes(f.observacoes ?? "")
    setFotosMantidas(f.fotos)
    setFotosNovas([])
  }

  useEffect(() => {
    if (criando) {
      // Anestesista criando a própria ficha já vem preenchido
      try {
        const roles: string[] = JSON.parse(localStorage.getItem("roles") ?? "[]")
        const id = localStorage.getItem("userId")
        if (id && roles.some((r) => ROLES_ANESTESISTA.includes(r))) {
          setAnestesista({
            id,
            nome: localStorage.getItem("nome") || null,
            email: localStorage.getItem("email"),
            sigla: localStorage.getItem("sigla") || null,
          })
        }
      } catch {}
      return
    }

    chamarApi(`/fichas/${fichaId}`)
      .then(async (res) => {
        const result = await res.json()
        if (!res.ok) throw new Error(result.error ?? "Não foi possível carregar a ficha.")
        setFicha(result)
        preencher(result)
      })
      .catch((err) => setError(err.message))
      .finally(() => setCarregando(false))
  }, [criando, fichaId])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  // Busca de anestesista: a mesma lista de médicos usada no plantão
  useEffect(() => {
    const termo = busca.trim()
    if (!termo) {
      setResultados([])
      setBuscando(false)
      return
    }
    setBuscando(true)
    const timeoutId = setTimeout(() => {
      const params = new URLSearchParams({ search: termo, role: ROLES_ANESTESISTA.join(",") })
      chamarApi(`/users?${params}`)
        .then(async (res) => {
          const resultado = await res.json()
          if (res.ok) setResultados(resultado)
        })
        .catch(() => {})
        .finally(() => setBuscando(false))
    }, 300)
    return () => clearTimeout(timeoutId)
  }, [busca])

  const totalFotos = fotosMantidas.length + fotosNovas.length

  async function adicionarFotos(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(e.target.files ?? []).slice(0, MAX_FOTOS - totalFotos)
    e.target.value = ""
    if (arquivos.length === 0) return
    setError("")
    setProcessandoFoto(true)
    try {
      const reduzidas = await Promise.all(arquivos.map((a) => comprimirImagem(a)))
      setFotosNovas((prev) => [...prev, ...reduzidas].slice(0, MAX_FOTOS - fotosMantidas.length))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível ler a foto.")
    } finally {
      setProcessandoFoto(false)
    }
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (!anestesista) return setError("Escolha o anestesista.")
    if (!tipo) return setError("Escolha o tipo de anestesia.")
    if (tipo === "outros" && !tipoOutro.trim()) return setError("Descreva o tipo de anestesia.")
    if (horaInicio === horaFim) return setError("A hora de término precisa ser diferente da de início.")

    setSalvando(true)
    try {
      const corpo = {
        data,
        hora_inicio: horaInicio,
        hora_fim: horaFim,
        anestesista_id: anestesista.id,
        tipo_anestesia: tipo,
        tipo_outro: tipo === "outros" ? tipoOutro.trim() : null,
        observacoes: observacoes.trim() || null,
        fotos_novas: fotosNovas,
        ...(criando ? {} : { fotos_mantidas: fotosMantidas.map((f) => f.caminho) }),
      }
      const res = await chamarApi(criando ? "/fichas" : `/fichas/${fichaId}`, criando ? "POST" : "PATCH", corpo)
      const result = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(result.error ?? "Não foi possível salvar a ficha.")
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar a ficha.")
    } finally {
      setSalvando(false)
    }
  }

  function confirmarExclusao() {
    setConfirmacao({
      titulo: "Excluir ficha?",
      mensagem: <p>A ficha e as fotos dela serão apagadas. Não dá para desfazer.</p>,
      rotuloConfirmar: "Excluir",
      perigo: true,
      acao: async () => {
        const res = await chamarApi(`/fichas/${fichaId}`, "DELETE")
        if (!res.ok) {
          const result = await res.json().catch(() => ({}))
          setError(result.error ?? "Não foi possível excluir a ficha.")
          return
        }
        onSaved()
        onClose()
      },
    })
  }

  const titulo = criando ? "Nova ficha anestésica" : editando ? "Editar ficha anestésica" : "Ficha anestésica"
  // Visualização = a mesma ficha, preenchida e travada, como o cartão de papel
  const somenteLeitura = !editando
  const f = ficha

  const tipoAtual = somenteLeitura ? f?.tipo_anestesia ?? null : tipo
  const outroAtual = somenteLeitura ? f?.tipo_outro ?? "" : tipoOutro
  const anestesistaAtual = somenteLeitura ? f?.anestesista ?? null : anestesista
  const fotosVisiveis = somenteLeitura
    ? (f?.fotos ?? []).map((x) => ({ chave: x.caminho, src: x.url, remover: null as null | (() => void) }))
    : [
        ...fotosMantidas.map((x) => ({
          chave: x.caminho,
          src: x.url,
          remover: () => setFotosMantidas((prev) => prev.filter((y) => y.caminho !== x.caminho)),
        })),
        ...fotosNovas.map((src, i) => ({
          chave: `nova-${i}`,
          src,
          remover: () => setFotosNovas((prev) => prev.filter((_, j) => j !== i)),
        })),
      ]

  const cartao = (
    // Moldura do cartão: borda escura por dentro da margem branca
    <div className="bg-white p-2 sm:p-3">
      <div className="border-2 border-gray-700 p-3 sm:p-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_17rem]">
          {/* Canto livre do cartão: título e quem registrou */}
          <div className="sm:row-span-2 flex flex-col justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-gray-500">GAMI</p>
              <h1 className="text-lg font-bold uppercase tracking-wide text-gray-800">{titulo}</h1>
            </div>
            {f && (
              <p className="text-[11px] text-gray-500 leading-snug">
                Criada por {nomeDe(f.criadoPor)} em {new Date(f.criadoEm).toLocaleString("pt-BR")}
                {f.atualizadoPor && f.atualizadoEm && (
                  <span className="block">
                    Editada por {nomeDe(f.atualizadoPor)} em {new Date(f.atualizadoEm).toLocaleString("pt-BR")}
                  </span>
                )}
              </p>
            )}
          </div>

          <CaixaCinza>
            <CampoLinha rotulo="Data" htmlFor="fichaData">
              {somenteLeitura ? (
                <ValorLinha>{f ? formatarData(f.data) : ""}</ValorLinha>
              ) : (
                <input id="fichaData" type="date" required value={data} onChange={(e) => setData(e.target.value)} className={INPUT_LINHA} />
              )}
            </CampoLinha>
          </CaixaCinza>

          <CaixaCinza className="space-y-2">
            <CampoLinha rotulo={<>Hora<br />início</>} htmlFor="fichaInicio">
              {somenteLeitura ? (
                <ValorLinha>{f?.hora_inicio.slice(0, 5)}</ValorLinha>
              ) : (
                <input id="fichaInicio" type="time" required value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} className={INPUT_LINHA} />
              )}
            </CampoLinha>
            <CampoLinha rotulo={<>Hora<br />término</>} htmlFor="fichaFim">
              {somenteLeitura ? (
                <ValorLinha>{f?.hora_fim.slice(0, 5)}</ValorLinha>
              ) : (
                <input id="fichaFim" type="time" required value={horaFim} onChange={(e) => setHoraFim(e.target.value)} className={INPUT_LINHA} />
              )}
            </CampoLinha>
          </CaixaCinza>
        </div>

        <div className="grid gap-3 sm:grid-cols-[16rem_minmax(0,1fr)]">
          {/* Quadro da foto (uma por ficha): onde no papel ia o "+ foto ficha anexada" */}
          <div className="order-2 sm:order-none border-2 border-gray-700 p-2 flex flex-col min-h-[11rem]">
            <div className="grid grid-cols-1 gap-2 flex-1 content-start">
              {fotosVisiveis.map((foto) => (
                <MiniaturaFoto key={foto.chave} src={foto.src} onRemover={foto.remover} />
              ))}
              {!somenteLeitura && totalFotos < MAX_FOTOS && (
                <label className="aspect-square flex flex-col items-center justify-center border-2 border-dashed border-gray-400 text-gray-500 hover:bg-gray-50 cursor-pointer text-center">
                  <span className="text-xl leading-none">+</span>
                  <span className="text-[10px] font-medium leading-tight mt-0.5">{processandoFoto ? "Preparando..." : "Foto"}</span>
                  {/* No celular abre a câmera ou a galeria */}
                  <input type="file" accept="image/*" onChange={adicionarFotos} disabled={processandoFoto} className="hidden" />
                </label>
              )}
              {somenteLeitura && fotosVisiveis.length === 0 && (
                <p className="col-span-full text-xs text-gray-400 italic">Sem foto anexada</p>
              )}
            </div>
            <p className="text-center text-[10px] font-medium uppercase tracking-wide text-gray-700 mt-2">
              Foto
            </p>
          </div>

          {/* Linhas do cartão */}
          <div className="space-y-4">
            <div className="relative">
              <CampoLinha rotulo="Anestesista" htmlFor="fichaBusca">
                {anestesistaAtual && (somenteLeitura || !busca) ? (
                  <div className="flex items-center gap-2 border-b border-gray-700 pb-0.5 min-h-[1.75rem]">
                    <SiglaBadge sigla={anestesistaAtual.sigla} size="sm" />
                    <span className="flex-1 min-w-0 truncate text-sm font-medium text-gray-900">{nomeDe(anestesistaAtual)}</span>
                    {!somenteLeitura && (
                      <button type="button" onClick={() => setAnestesista(null)} className="text-xs font-medium text-brand-700 hover:text-brand-800">
                        Trocar
                      </button>
                    )}
                  </div>
                ) : (
                  <input
                    id="fichaBusca"
                    type="text"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar anestesista"
                    autoComplete="off"
                    className={INPUT_LINHA}
                  />
                )}
              </CampoLinha>
              {!somenteLeitura && busca.trim() && (
                <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {buscando ? (
                    <p className="px-4 py-2.5 text-sm text-gray-400">Buscando...</p>
                  ) : resultados.length === 0 ? (
                    <p className="px-4 py-2.5 text-sm text-gray-400">Nenhum anestesista encontrado.</p>
                  ) : (
                    resultados.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => {
                          setAnestesista(r)
                          setBusca("")
                        }}
                        className="w-full flex items-center gap-2 text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <SiglaBadge sigla={r.sigla} size="sm" />
                        <span className="min-w-0 truncate">{nomeDe(r)}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-gray-700 mb-2">Tipo de anestesia</p>
              {/* Quadradinhos como no papel: marcar um desmarca o outro. Colunas de largura mínima
                  para "RAQUIANESTESIA" caber inteira sem invadir a vizinha */}
              <div
                role="radiogroup"
                aria-label="Tipo de anestesia"
                className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-x-3 gap-y-3"
              >
                {TIPOS_ANESTESIA.map((t) => (
                  <Quadradinho
                    key={t.valor}
                    rotulo={t.rotulo}
                    marcado={tipoAtual === t.valor}
                    onClick={somenteLeitura ? undefined : () => setTipo(t.valor)}
                  />
                ))}
              </div>
            </div>
            {tipoAtual === "outros" && (
              <div>
                {somenteLeitura ? (
                  <ValorLinha>{outroAtual}</ValorLinha>
                ) : (
                  <input
                    type="text"
                    required
                    maxLength={100}
                    value={tipoOutro}
                    onChange={(e) => setTipoOutro(e.target.value)}
                    placeholder="Qual? Descreva o tipo de anestesia"
                    className={INPUT_LINHA}
                  />
                )}
              </div>
            )}
          </div>
        </div>

        {/* Observações em texto, ocupando a largura toda no pé da ficha */}
        <div className="border-2 border-gray-700 p-2">
          <label htmlFor="fichaObservacoes" className="block text-[11px] font-medium uppercase tracking-wide text-gray-700 mb-1">
            Observações
          </label>
          {somenteLeitura ? (
            <p className="min-h-[4rem] whitespace-pre-wrap break-words text-sm text-gray-900">
              {f?.observacoes || <span className="italic text-gray-400">Sem observações</span>}
            </p>
          ) : (
            <>
              <textarea
                id="fichaObservacoes"
                rows={4}
                maxLength={MAX_OBSERVACOES}
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Escreva aqui as observações (opcional)"
                className="w-full resize-y bg-transparent border-0 p-1 text-base sm:text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-0"
              />
              <p className="text-right text-[10px] text-gray-400">
                {observacoes.length}/{MAX_OBSERVACOES}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <div
      className="fixed inset-x-0 top-0 z-50 flex sm:items-center justify-center sm:px-4 sm:py-8"
      style={{ height: viewport ? viewport.altura : "100dvh", transform: viewport ? `translateY(${viewport.topo}px)` : undefined }}
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative bg-gray-100 sm:rounded-2xl shadow-xl w-full sm:max-w-3xl h-full sm:h-auto sm:max-h-full flex flex-col">
        <div className="shrink-0 flex justify-end px-3 pt-3">
          <button onClick={onClose} aria-label="Fechar" className="text-gray-400 hover:text-gray-600 p-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {carregando ? (
          <p className="px-5 sm:px-8 pb-8 text-sm text-gray-400">Carregando...</p>
        ) : somenteLeitura && !f ? (
          <p className="px-5 sm:px-8 pb-8 text-sm text-red-600">{error || "Ficha não encontrada."}</p>
        ) : (
          <form onSubmit={salvar} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 sm:px-5 pb-3 space-y-3">
              <div className="shadow-sm">{cartao}</div>
              {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
            </div>

            {/* As chaves fazem o React trocar os botões em vez de reaproveitá-los: sem isso, o "Editar"
                vira o "Salvar" no meio do clique e o formulário é enviado na hora */}
            {somenteLeitura ? (
              f?.podeEditar && (
                <div key="acoes-visualizacao" className="shrink-0 flex gap-3 px-3 sm:px-5 py-4 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={confirmarExclusao}
                    className="flex-1 border border-red-200 bg-white text-red-600 hover:bg-red-50 font-semibold py-2.5 rounded-lg text-sm transition-colors"
                  >
                    Excluir
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault()
                      setEditando(true)
                    }}
                    className="flex-1 bg-brand-700 hover:bg-brand-800 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
                  >
                    Editar
                  </button>
                </div>
              )
            ) : (
              <div key="acoes-edicao" className="shrink-0 flex gap-3 px-3 sm:px-5 py-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    if (criando) return onClose()
                    if (ficha) preencher(ficha)
                    setError("")
                    setEditando(false)
                  }}
                  className="flex-1 border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 font-semibold py-2.5 rounded-lg text-sm transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvando || processandoFoto}
                  className="flex-1 bg-brand-700 hover:bg-brand-800 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60"
                >
                  {salvando ? "Salvando..." : "Salvar"}
                </button>
              </div>
            )}
          </form>
        )}
      </div>

      {confirmacao && <ConfirmacaoModal confirmacao={confirmacao} onClose={() => setConfirmacao(null)} />}
    </div>
  )
}

// Campo escrito "na linha", como no papel
const INPUT_LINHA =
  "w-full bg-transparent border-0 border-b border-gray-700 rounded-none px-1 py-0.5 text-base sm:text-sm font-medium text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-600 focus:ring-0"

function CaixaCinza({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-gray-300 px-3 py-2.5 ${className}`}>{children}</div>
}

function CampoLinha({ rotulo, htmlFor, children }: { rotulo: React.ReactNode; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-end gap-3">
      <label htmlFor={htmlFor} className="shrink-0 w-20 text-[11px] font-medium uppercase tracking-wide text-gray-700 leading-tight">
        {rotulo}
      </label>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}

function ValorLinha({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-b border-gray-700 px-1 pb-0.5 min-h-[1.5rem] text-sm font-medium text-gray-900 truncate">{children}</p>
  )
}

// Quadradinho do papel: marcado com um X
function Quadradinho({ rotulo, marcado, onClick }: { rotulo: string; marcado: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={marcado}
      onClick={onClick}
      disabled={!onClick}
      className="flex items-center gap-2 min-w-0 text-left disabled:cursor-default group"
    >
      <span
        className={`w-5 h-5 shrink-0 border-2 border-gray-700 flex items-center justify-center ${
          onClick ? "group-hover:border-brand-600" : ""
        }`}
      >
        {marcado && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="text-brand-700">
            <line x1="5" y1="5" x2="19" y2="19" />
            <line x1="19" y1="5" x2="5" y2="19" />
          </svg>
        )}
      </span>
      <span className={`min-w-0 break-words text-[11px] uppercase ${marcado ? "font-bold text-gray-900" : "text-gray-700"}`}>{rotulo}</span>
    </button>
  )
}

function MiniaturaFoto({ src, onRemover }: { src: string; onRemover: (() => void) | null }) {
  return (
    <div className="relative aspect-square overflow-hidden border border-gray-300">
      {onRemover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="Foto da ficha" className="w-full h-full object-cover" />
      ) : (
        // Na visualização, tocar abre a foto em tamanho grande
        <a href={src} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="Foto da ficha" className="w-full h-full object-cover hover:opacity-90" />
        </a>
      )}
      {onRemover && (
        <button
          type="button"
          onClick={onRemover}
          aria-label="Remover foto"
          className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white text-xs flex items-center justify-center hover:bg-black/80"
        >
          ✕
        </button>
      )}
    </div>
  )
}
