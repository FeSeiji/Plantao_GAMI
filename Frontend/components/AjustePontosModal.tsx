"use client"

import React, { useEffect, useState } from "react"
import { INPUT_CLASS } from "./UsuarioModal"
import { apiFetch } from "./sessao"

type Medico = { id: string; nome?: string | null; email?: string | null; sigla?: string | null }

// Ajuste já lançado, na edição: o médico e o mês não mudam (para isso, exclua e lance de novo)
export type AjusteEditavel = { id: string; pontos: number; motivo: string; medico: Medico }

type Props = {
  // Mês do BM aberto na tela, 'AAAA-MM'
  mes: string
  rotuloMes: string
  ajuste?: AjusteEditavel
  onClose: () => void
  // Avisa a tela para recarregar o BM
  onSaved: () => void
}

const LABEL_CLASS = "block text-sm font-medium text-gray-700 mb-1"

const nomeDe = (m: Medico) => m.nome ?? m.email ?? m.id

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

// Quem tem a flag admin dá ou tira pontos de um sócio no mês, sempre com um motivo
// (POST /bm-financeiro/ajustes e PATCH /bm-financeiro/ajustes/:id)
export default function AjustePontosModal({ mes, rotuloMes, ajuste, onClose, onSaved }: Props) {
  const [medicos, setMedicos] = useState<Medico[]>([])
  const [usuarioId, setUsuarioId] = useState(ajuste?.medico.id ?? "")
  const [sinal, setSinal] = useState<"dar" | "tirar">(ajuste && ajuste.pontos < 0 ? "tirar" : "dar")
  const [quantidade, setQuantidade] = useState(ajuste ? String(Math.abs(ajuste.pontos)).replace(".", ",") : "")
  const [motivo, setMotivo] = useState(ajuste?.motivo ?? "")

  const [error, setError] = useState("")
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (ajuste) return
    chamarApi("/users?role=anestesita_socio")
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? "Não foi possível carregar os sócios.")
        setMedicos([...data].sort((a: Medico, b: Medico) => nomeDe(a).localeCompare(nomeDe(b), "pt-BR")))
      })
      .catch((err) => setError(err.message))
  }, [ajuste])

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
    // Aceita vírgula ou ponto como separador decimal
    const valor = Number(quantidade.trim().replace(",", "."))
    if (!Number.isFinite(valor) || valor <= 0) return setError("Informe quantos pontos (maior que zero).")
    if (!motivo.trim()) return setError("Informe o motivo.")

    const pontos = sinal === "tirar" ? -valor : valor
    setSalvando(true)
    try {
      const res = ajuste
        ? await chamarApi(`/bm-financeiro/ajustes/${ajuste.id}`, "PATCH", { pontos, motivo: motivo.trim() })
        : await chamarApi("/bm-financeiro/ajustes", "POST", { usuario_id: usuarioId, mes, pontos, motivo: motivo.trim() })
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-full flex flex-col">
        <div className="shrink-0 flex items-start justify-between px-6 sm:px-8 pt-6 pb-2">
          <div>
            <h1 className="text-xl font-bold text-gray-800">{ajuste ? "Editar ajuste" : "Dar ou tirar pontos"}</h1>
            <p className="text-gray-400 text-sm mt-1">
              Conta no BM de {rotuloMes}. Todos os sócios veem o ajuste e o histórico.
            </p>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="text-gray-400 hover:text-gray-600 p-1 -mr-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form onSubmit={salvar} className="flex flex-col min-h-0">
          <div className="overflow-y-auto overscroll-contain px-6 sm:px-8 pt-2 pb-4 space-y-4">
            <div>
              <label htmlFor="ajustePontosMedico" className={LABEL_CLASS}>
                Sócio
              </label>
              {ajuste ? (
                <p className="text-sm text-gray-800 py-2">
                  {nomeDe(ajuste.medico)}
                  {ajuste.medico.sigla ? ` (${ajuste.medico.sigla})` : ""}
                </p>
              ) : (
                <select
                  id="ajustePontosMedico"
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
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className={LABEL_CLASS}>Ajuste</p>
                <div role="radiogroup" aria-label="Dar ou tirar pontos" className="flex items-center bg-gray-100 rounded-lg p-0.5">
                  {(
                    [
                      { valor: "dar", rotulo: "Dar +" },
                      { valor: "tirar", rotulo: "Tirar −" },
                    ] as const
                  ).map((opcao) => (
                    <button
                      key={opcao.valor}
                      type="button"
                      role="radio"
                      aria-checked={sinal === opcao.valor}
                      onClick={() => setSinal(opcao.valor)}
                      className={`flex-1 text-xs font-semibold px-2.5 py-2 rounded-md transition-colors ${
                        sinal === opcao.valor
                          ? `bg-white shadow-sm ${opcao.valor === "dar" ? "text-green-700" : "text-red-600"}`
                          : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      {opcao.rotulo}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label htmlFor="ajustePontosQuantidade" className={LABEL_CLASS}>
                  Pontos
                </label>
                <input
                  id="ajustePontosQuantidade"
                  type="text"
                  inputMode="decimal"
                  required
                  placeholder="Ex.: 5"
                  value={quantidade}
                  onChange={(e) => setQuantidade(e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>
            </div>

            <div>
              <label htmlFor="ajustePontosMotivo" className={LABEL_CLASS}>
                Motivo
              </label>
              <input
                id="ajustePontosMotivo"
                type="text"
                required
                maxLength={200}
                placeholder="Ex.: Reunião do dia 10, Administrativo"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
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
      </div>
    </div>
  )
}
