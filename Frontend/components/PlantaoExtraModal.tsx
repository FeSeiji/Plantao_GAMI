"use client"

import React, { useEffect, useMemo, useState } from "react"
import { INPUT_CLASS, ROLES_ANESTESISTA } from "./UsuarioModal"
import { TURNOS, descreverPosicao, rotuloPosicao, vagasDoTurno } from "./posicoes"
import { PlantaoExtra, formatarHorarioExtra, horasDoExtra } from "./extras"
import { formatarPontos } from "./trocaPorHoras"
import { apiFetch } from "./sessao"

type Props = {
  // null: novo plantão extra
  extra: PlantaoExtra | null
  // Dia já escolhido ao criar (o dia clicado no calendário)
  dataInicial?: string
  // Gestão: cria, edita e exclui; os outros só veem
  podeEditar: boolean
  onClose: () => void
  // Avisa a tela para recarregar
  onSaved: () => void
}

type Medico = { id: string; nome: string | null; email: string | null; sigla: string | null; roles: string[]; ativo: boolean }

const LABEL_CLASS = "block text-sm font-medium text-gray-700 mb-1"

const nomeDe = (m: { nome?: string | null; email?: string | null; id: string }) => m.nome ?? m.email ?? m.id

const ROTULO_TIPO: Record<PlantaoExtra["tipo"], string> = {
  socio: "Sócio",
  socio_jr: "Sócio Jr",
  plantonista: "Plantonista",
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

function formatarData(data: string) {
  return new Date(`${data}T00:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" })
}

// Plantão extra: a gestão escolhe o médico, o dia e o horário; para sócio, também a posição cuja pontuação ele
// recebe (proporcional às horas). Plantonista e sócio Jr contam as horas
export default function PlantaoExtraModal({ extra, dataInicial, podeEditar, onClose, onSaved }: Props) {
  const criando = extra === null
  const [medicos, setMedicos] = useState<Medico[]>([])
  const [usuarioId, setUsuarioId] = useState(extra?.medico.id ?? "")
  const [data, setData] = useState(extra?.data ?? dataInicial ?? "")
  const [horaInicio, setHoraInicio] = useState(extra?.hora_inicio ?? "")
  const [horaFim, setHoraFim] = useState(extra?.hora_fim ?? "")
  const [posicao, setPosicao] = useState<number | "">(extra?.posicao ?? "")
  const [observacao, setObservacao] = useState(extra?.observacao ?? "")

  const [error, setError] = useState("")
  const [salvando, setSalvando] = useState(false)
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false)

  // A lista da gestão traz os cargos: é por eles que o sócio escolhe a posição
  useEffect(() => {
    if (!podeEditar) return
    chamarApi("/users/gestao")
      .then(async (res) => {
        const lista = await res.json()
        if (!res.ok) throw new Error(lista.error ?? "Não foi possível carregar os médicos.")
        setMedicos(
          (lista as Medico[])
            .filter((u) => u.ativo && u.roles.some((r) => ROLES_ANESTESISTA.includes(r)))
            .sort((a, b) => nomeDe(a).localeCompare(nomeDe(b), "pt-BR")),
        )
      })
      .catch((err) => setError(err.message))
  }, [podeEditar])

  useEffect(() => {
    const overflowAnterior = document.body.style.overflow
    document.body.style.overflow = "hidden"
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.body.style.overflow = overflowAnterior
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [onClose])

  const medico = medicos.find((m) => m.id === usuarioId)
  const ehSocio = podeEditar ? (medico?.roles.includes("anestesita_socio") ?? false) : extra?.tipo === "socio"
  const horas = horaInicio && horaFim && horaInicio !== horaFim ? horasDoExtra(horaInicio, horaFim) : null

  // As vagas do dia escolhido; as que têm o mesmo nome no turno (os dois coordenadores) ganham o número da vaga
  const opcoesPosicao = useMemo(() => {
    if (!data) return []
    return TURNOS.map((t) => {
      const vagas = vagasDoTurno(t.valor, data)
      return {
        turno: t,
        vagas: vagas.map((p) => {
          const rotulo = rotuloPosicao(data, p)
          const repetido = vagas.some((o) => o !== p && rotuloPosicao(data, o) === rotulo)
          return { posicao: p, rotulo: repetido ? `${rotulo} (vaga ${p})` : rotulo }
        }),
      }
    })
  }, [data])

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (!usuarioId) return setError("Escolha o médico.")
    if (ehSocio && posicao === "") return setError("Escolha a posição que vale para os pontos do sócio.")

    setSalvando(true)
    try {
      const corpo = {
        data,
        hora_inicio: horaInicio,
        hora_fim: horaFim,
        usuario_id: usuarioId,
        posicao: ehSocio ? posicao : null,
        observacao: observacao.trim() || null,
      }
      const res = criando
        ? await chamarApi("/plantoes-extras", "POST", corpo)
        : await chamarApi(`/plantoes-extras/${extra.id}`, "PATCH", corpo)
      const result = await res.json()
      if (!res.ok) throw new Error(result.error ?? "Não foi possível salvar.")
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar.")
    } finally {
      setSalvando(false)
    }
  }

  async function excluir() {
    if (!extra) return
    setError("")
    setSalvando(true)
    try {
      const res = await chamarApi(`/plantoes-extras/${extra.id}`, "DELETE")
      if (!res.ok) {
        const result = await res.json().catch(() => ({}))
        throw new Error(result.error ?? "Não foi possível excluir.")
      }
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível excluir.")
    } finally {
      setSalvando(false)
      setConfirmandoExclusao(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-full flex flex-col">
        <div className="shrink-0 flex items-start justify-between px-6 sm:px-8 pt-6 pb-2">
          <div>
            <h1 className="text-xl font-bold text-gray-800">{criando ? "Novo plantão extra" : "Plantão extra"}</h1>
            <p className="text-gray-400 text-sm mt-1">Em paralelo ao plantão do dia, sem troca.</p>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="text-gray-400 hover:text-gray-600 p-1 -mr-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {!podeEditar && extra ? (
          <div className="px-6 sm:px-8 pb-6 pt-2 overflow-y-auto">
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-gray-400 text-xs">Médico</dt>
                <dd className="font-medium text-gray-800">
                  {nomeDe(extra.medico)} <span className="text-gray-400 font-normal">· {ROTULO_TIPO[extra.tipo]}</span>
                </dd>
              </div>
              <div>
                <dt className="text-gray-400 text-xs">Quando</dt>
                <dd className="font-medium text-gray-800 capitalize">
                  {formatarData(extra.data)} · {formatarHorarioExtra(extra)} ({formatarPontos(extra.horas)}h)
                </dd>
              </div>
              {extra.posicao != null && (
                <div>
                  <dt className="text-gray-400 text-xs">Pontos como</dt>
                  <dd className="font-medium text-gray-800">{descreverPosicao(extra.data, extra.posicao)}</dd>
                </div>
              )}
              {extra.observacao && (
                <div>
                  <dt className="text-gray-400 text-xs">Observação</dt>
                  <dd className="text-gray-800">{extra.observacao}</dd>
                </div>
              )}
            </dl>
          </div>
        ) : (
          <form onSubmit={salvar} className="flex flex-col min-h-0">
            <div className="overflow-y-auto overscroll-contain px-6 sm:px-8 pt-2 pb-4 space-y-4">
              <div>
                <label htmlFor="extraMedico" className={LABEL_CLASS}>
                  Médico
                </label>
                <select
                  id="extraMedico"
                  required
                  value={usuarioId}
                  onChange={(e) => setUsuarioId(e.target.value)}
                  className={INPUT_CLASS}
                >
                  <option value="">Escolher</option>
                  {medicos.map((m) => (
                    <option key={m.id} value={m.id}>
                      {nomeDe(m)}
                      {m.sigla ? ` (${m.sigla})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-3 sm:col-span-1">
                  <label htmlFor="extraData" className={LABEL_CLASS}>
                    Dia
                  </label>
                  <input id="extraData" type="date" required value={data} onChange={(e) => setData(e.target.value)} className={INPUT_CLASS} />
                </div>
                <div>
                  <label htmlFor="extraInicio" className={LABEL_CLASS}>
                    Início
                  </label>
                  <input
                    id="extraInicio"
                    type="time"
                    required
                    value={horaInicio}
                    onChange={(e) => setHoraInicio(e.target.value)}
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label htmlFor="extraFim" className={LABEL_CLASS}>
                    Fim
                  </label>
                  <input id="extraFim" type="time" required value={horaFim} onChange={(e) => setHoraFim(e.target.value)} className={INPUT_CLASS} />
                </div>
              </div>
              {horas != null && (
                <p className="text-xs text-gray-500 -mt-2">
                  {formatarPontos(horas)}h{horaFim < horaInicio ? ", terminando no dia seguinte" : ""}
                </p>
              )}

              {ehSocio && (
                <div>
                  <label htmlFor="extraPosicao" className={LABEL_CLASS}>
                    Posição para os pontos
                  </label>
                  <select
                    id="extraPosicao"
                    value={posicao}
                    disabled={!data}
                    onChange={(e) => setPosicao(e.target.value === "" ? "" : Number(e.target.value))}
                    className={INPUT_CLASS}
                  >
                    <option value="">{data ? "Escolher" : "Escolha o dia primeiro"}</option>
                    {opcoesPosicao.map(({ turno, vagas }) => (
                      <optgroup key={turno.valor} label={turno.rotulo}>
                        {vagas.map((v) => (
                          <option key={v.posicao} value={v.posicao}>
                            {v.rotulo}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    O sócio recebe os pontos dessa posição, proporcionais às horas do extra (6h numa vaga de 12h valem metade).
                  </p>
                </div>
              )}
              {medico && !ehSocio && (
                <p className="text-xs text-gray-500">
                  {medico.roles.includes("anestesita_socio_jr") ? "Sócio Jr" : "Plantonista"}: no BM conta pelas horas.
                </p>
              )}

              <div>
                <label htmlFor="extraObs" className={LABEL_CLASS}>
                  Observação <span className="font-normal text-gray-400">(opcional)</span>
                </label>
                <input
                  id="extraObs"
                  type="text"
                  maxLength={200}
                  placeholder="Ex.: sala extra no centro cirúrgico"
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>

              {!criando && (
                <div className="text-sm">
                  {confirmandoExclusao ? (
                    <span className="flex flex-wrap items-center gap-3">
                      <span className="text-gray-700">Excluir este plantão extra?</span>
                      <button type="button" onClick={excluir} disabled={salvando} className="font-semibold text-red-600 hover:text-red-800">
                        Excluir
                      </button>
                      <button type="button" onClick={() => setConfirmandoExclusao(false)} className="text-gray-500 hover:text-gray-700">
                        Não
                      </button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => setConfirmandoExclusao(true)} className="font-medium text-red-600 hover:text-red-800">
                      Excluir plantão extra
                    </button>
                  )}
                </div>
              )}

              {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
            </div>

            <div className="shrink-0 flex gap-3 px-6 sm:px-8 py-4 border-t border-gray-200">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 font-semibold py-2.5 rounded-lg text-sm transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={salvando}
                className="flex-1 bg-brand-700 hover:bg-brand-800 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60"
              >
                {salvando ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
