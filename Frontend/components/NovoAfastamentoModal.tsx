"use client"

import React, { useEffect, useState } from "react"
import { INPUT_CLASS, ROLES_ANESTESISTA } from "./UsuarioModal"
import { TIPOS_AFASTAMENTO, TIPOS_CONGRESSO, TipoCongresso } from "./disponibilidade"
import { apiFetch } from "./sessao"

type Props = {
  onClose: () => void
  // Avisa a tela para recarregar a lista
  onSaved: () => void
}

type Medico = { id: string; nome?: string | null; email?: string | null; sigla?: string | null }

type PlantaoAfetado = { id: string; titulo: string; data: string; hora_inicio: string }

const LABEL_CLASS = "block text-sm font-medium text-gray-700 mb-1"

const nomeDe = (m: Medico) => m.nome ?? m.email ?? m.id

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

// A gestão cadastra férias ou congresso de qualquer médico. Já entra aprovado e pode ser no passado
// (POST /afastamentos/usuario/:usuarioId)
export default function NovoAfastamentoModal({ onClose, onSaved }: Props) {
  const [medicos, setMedicos] = useState<Medico[]>([])
  const [usuarioId, setUsuarioId] = useState("")
  const [tipo, setTipo] = useState<"ferias" | "congresso">("ferias")
  const [congressoTipo, setCongressoTipo] = useState<TipoCongresso | "">("")
  const [inicio, setInicio] = useState("")
  const [fim, setFim] = useState("")
  const [observacao, setObservacao] = useState("")

  const [error, setError] = useState("")
  const [salvando, setSalvando] = useState(false)
  // Depois de salvar: plantões em que o médico já estava escalado no período
  const [afetados, setAfetados] = useState<PlantaoAfetado[] | null>(null)

  useEffect(() => {
    const params = new URLSearchParams({ role: ROLES_ANESTESISTA.join(",") })
    chamarApi(`/users?${params}`)
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? "Não foi possível carregar os médicos.")
        setMedicos([...data].sort((a: Medico, b: Medico) => nomeDe(a).localeCompare(nomeDe(b), "pt-BR")))
      })
      .catch((err) => setError(err.message))
  }, [])

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

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (!usuarioId) return setError("Escolha o médico.")
    if (tipo === "congresso" && !congressoTipo) return setError("Escolha se o médico vai como palestrante ou congressista.")

    setSalvando(true)
    try {
      const res = await chamarApi(`/afastamentos/usuario/${usuarioId}`, "POST", {
        tipo,
        congresso_tipo: tipo === "congresso" ? congressoTipo : null,
        data_inicio: inicio,
        data_fim: fim,
        observacao: observacao.trim() || null,
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error ?? "Não foi possível salvar.")
      onSaved()
      // Com plantões no período, mostra quais antes de fechar; sem nenhum, fecha direto
      if (result.plantoesAfetados?.length) setAfetados(result.plantoesAfetados)
      else onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar.")
    } finally {
      setSalvando(false)
    }
  }

  const medico = medicos.find((m) => m.id === usuarioId)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-full flex flex-col">
        <div className="shrink-0 flex items-start justify-between px-6 sm:px-8 pt-6 pb-2">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Novo período</h1>
            <p className="text-gray-400 text-sm mt-1">Cadastrado pela gestão, já entra aprovado.</p>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="text-gray-400 hover:text-gray-600 p-1 -mr-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {afetados ? (
          <div className="px-6 sm:px-8 pb-6 pt-2 overflow-y-auto">
            <div className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <p className="font-medium mb-1">Salvo. {medico ? nomeDe(medico) : "O médico"} já tem plantões nesse período:</p>
              <ul className="list-disc pl-5">
                {afetados.map((p) => (
                  // Quem faz o diurno e o noturno do mesmo dia aparece duas vezes, uma por horário
                  <li key={`${p.id}-${p.hora_inicio}`}>
                    {formatarData(p.data)} · {p.hora_inicio.slice(0, 5)} · {p.titulo}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-amber-800">
                {tipo === "congresso"
                  ? "Durante o congresso, esses plantões continuam como estão."
                  : "Esses plantões ficam marcados como indisponível para a gestão resolver."}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-full mt-4 bg-brand-700 hover:bg-brand-800 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
            >
              Fechar
            </button>
          </div>
        ) : (
          <form onSubmit={salvar} className="flex flex-col min-h-0">
            <div className="overflow-y-auto overscroll-contain px-6 sm:px-8 pt-2 pb-4 space-y-4">
              <div>
                <label htmlFor="novoAfastamentoMedico" className={LABEL_CLASS}>
                  Médico
                </label>
                <select
                  id="novoAfastamentoMedico"
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

              <div className="flex items-center bg-gray-100 rounded-lg p-0.5 w-full sm:w-72">
                {TIPOS_AFASTAMENTO.map((t) => (
                  <button
                    key={t.valor}
                    type="button"
                    onClick={() => setTipo(t.valor)}
                    className={`flex-1 text-xs font-semibold px-2.5 py-1.5 rounded-md transition-colors ${
                      tipo === t.valor ? "bg-white text-brand-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {t.rotulo}
                  </button>
                ))}
              </div>

              {tipo === "congresso" && (
                <div>
                  <p className={LABEL_CLASS}>Vai como</p>
                  <div role="radiogroup" aria-label="Tipo do congresso" className="grid grid-cols-2 gap-2">
                    {TIPOS_CONGRESSO.map((t) => (
                      <button
                        key={t.valor}
                        type="button"
                        role="radio"
                        aria-checked={congressoTipo === t.valor}
                        onClick={() => {
                          setCongressoTipo(t.valor)
                          setError("")
                        }}
                        className={`border rounded-lg py-2 text-sm font-semibold transition-colors ${
                          congressoTipo === t.valor
                            ? "border-brand-700 bg-brand-50 text-brand-800"
                            : "border-gray-300 text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        {t.rotulo}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Sem data mínima: a gestão pode lançar um período que já passou */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="novoAfastamentoInicio" className={LABEL_CLASS}>
                    Início
                  </label>
                  <input
                    id="novoAfastamentoInicio"
                    type="date"
                    required
                    value={inicio}
                    onChange={(e) => {
                      setInicio(e.target.value)
                      if (!fim || fim < e.target.value) setFim(e.target.value)
                    }}
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label htmlFor="novoAfastamentoFim" className={LABEL_CLASS}>
                    Fim
                  </label>
                  <input
                    id="novoAfastamentoFim"
                    type="date"
                    required
                    min={inicio || undefined}
                    value={fim}
                    onChange={(e) => setFim(e.target.value)}
                    className={INPUT_CLASS}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="novoAfastamentoObs" className={LABEL_CLASS}>
                  Observação <span className="font-normal text-gray-400">(opcional)</span>
                </label>
                <input
                  id="novoAfastamentoObs"
                  type="text"
                  maxLength={200}
                  placeholder={tipo === "congresso" ? "Ex.: Congresso Brasileiro de Anestesiologia" : ""}
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>

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
