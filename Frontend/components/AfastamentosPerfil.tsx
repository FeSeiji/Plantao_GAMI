"use client"

import React, { useEffect, useState } from "react"
import ConfirmacaoModal, { Confirmacao } from "./ConfirmacaoModal"
import { INPUT_CLASS } from "./UsuarioModal"
import { TIPOS_AFASTAMENTO } from "./disponibilidade"

type AfastamentoProprio = {
  id: string
  tipo: "ferias" | "congresso"
  data_inicio: string
  data_fim: string
  observacao: string | null
}

type PlantaoAfetado = {
  id: string
  titulo: string
  data: string
  hora_inicio: string
}

function formatarData(data: string) {
  return new Date(`${data}T00:00:00`).toLocaleDateString("pt-BR")
}

function hojeLocal() {
  return new Date().toLocaleDateString("en-CA")
}

function chamarApi(caminho: string, metodo = "GET", body?: unknown) {
  const token = localStorage.getItem("token")
  return fetch(`${process.env.NEXT_PUBLIC_API_URL}${caminho}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
}

// Férias e congressos do próprio médico: nesses dias ele não pode ser escalado
export default function AfastamentosPerfil() {
  const [afastamentos, setAfastamentos] = useState<AfastamentoProprio[]>([])
  const [carregando, setCarregando] = useState(true)

  const [tipo, setTipo] = useState<"ferias" | "congresso">("ferias")
  const [inicio, setInicio] = useState("")
  const [fim, setFim] = useState("")
  const [observacao, setObservacao] = useState("")

  const [error, setError] = useState("")
  const [salvando, setSalvando] = useState(false)
  const [afetados, setAfetados] = useState<PlantaoAfetado[]>([])
  const [confirmacao, setConfirmacao] = useState<Confirmacao | null>(null)

  useEffect(() => {
    chamarApi("/afastamentos/me")
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? "Não foi possível carregar férias e congressos.")
        setAfastamentos(data)
      })
      .catch((err) => setError(err.message))
      .finally(() => setCarregando(false))
  }, [])

  async function adicionar(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setAfetados([])
    setSalvando(true)

    try {
      const res = await chamarApi("/afastamentos", "POST", {
        tipo,
        data_inicio: inicio,
        data_fim: fim,
        observacao: observacao || null,
      })
      const result = await res.json()

      if (!res.ok) {
        setError(result.error ?? "Não foi possível salvar.")
        return
      }

      const { plantoesAfetados, ...criado } = result
      setAfastamentos((prev) => [...prev, criado].sort((a, b) => a.data_inicio.localeCompare(b.data_inicio)))
      setAfetados(plantoesAfetados ?? [])
      setInicio("")
      setFim("")
      setObservacao("")
    } catch {
      setError("Não foi possível conectar ao servidor.")
    } finally {
      setSalvando(false)
    }
  }

  async function remover(id: string) {
    setError("")
    const anterior = afastamentos
    setAfastamentos((prev) => prev.filter((a) => a.id !== id))

    try {
      const res = await chamarApi(`/afastamentos/${id}`, "DELETE")
      if (!res.ok && res.status !== 204) {
        const result = await res.json().catch(() => ({}))
        throw new Error(result.error ?? "Não foi possível remover.")
      }
    } catch (err) {
      setAfastamentos(anterior)
      setError(err instanceof Error ? err.message : "Não foi possível remover.")
    }
  }

  const rotuloTipo = (t: string) => TIPOS_AFASTAMENTO.find((x) => x.valor === t)?.rotulo ?? t

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 sm:p-8 mt-6">
      <h2 className="font-semibold text-gray-800">Férias e congressos</h2>
      <p className="text-sm text-gray-500 mt-1 mb-5">
        Nesses dias você não poderá ser escalado. Se já estiver em algum plantão no período, ele ficará marcado para a gestão.
      </p>

      {carregando ? (
        <p className="text-sm text-gray-400 mb-5">Carregando...</p>
      ) : afastamentos.length === 0 ? (
        <p className="text-sm text-gray-400 mb-5">Nenhum período cadastrado.</p>
      ) : (
        <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg mb-5">
          {afastamentos.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-3 py-2.5">
              <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded bg-red-50 text-red-700">
                {rotuloTipo(a.tipo)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-800">
                  {formatarData(a.data_inicio)}
                  {a.data_fim !== a.data_inicio && ` a ${formatarData(a.data_fim)}`}
                </p>
                {a.observacao && <p className="text-xs text-gray-500 truncate">{a.observacao}</p>}
              </div>
              <button
                type="button"
                onClick={() =>
                  setConfirmacao({
                    titulo: "Remover período?",
                    mensagem: (
                      <p>
                        {rotuloTipo(a.tipo)} de {formatarData(a.data_inicio)} a {formatarData(a.data_fim)}. Você volta a
                        poder ser escalado nesses dias.
                      </p>
                    ),
                    rotuloConfirmar: "Remover",
                    perigo: true,
                    acao: () => remover(a.id),
                  })
                }
                className="shrink-0 text-xs font-medium text-red-600 hover:text-red-800"
              >
                Remover
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={adicionar} className="space-y-4">
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

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="afastamentoInicio" className="block text-sm font-medium text-gray-700 mb-1">
              Início
            </label>
            <input
              id="afastamentoInicio"
              type="date"
              required
              min={hojeLocal()}
              value={inicio}
              onChange={(e) => {
                setInicio(e.target.value)
                if (!fim || fim < e.target.value) setFim(e.target.value)
              }}
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label htmlFor="afastamentoFim" className="block text-sm font-medium text-gray-700 mb-1">
              Fim
            </label>
            <input
              id="afastamentoFim"
              type="date"
              required
              min={inicio || hojeLocal()}
              value={fim}
              onChange={(e) => setFim(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>
        </div>

        <div>
          <label htmlFor="afastamentoObs" className="block text-sm font-medium text-gray-700 mb-1">
            Observação (opcional)
          </label>
          <input
            id="afastamentoObs"
            type="text"
            maxLength={200}
            placeholder={tipo === "congresso" ? "Ex.: Congresso Brasileiro de Anestesiologia" : ""}
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            className={INPUT_CLASS}
          />
        </div>

        {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

        {afetados.length > 0 && (
          <div className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <p className="font-medium mb-1">Você já está escalado nesse período:</p>
            <ul className="list-disc pl-5">
              {afetados.map((p) => (
                <li key={p.id}>
                  {formatarData(p.data)} · {p.hora_inicio.slice(0, 5)} · {p.titulo}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-amber-800">Esses plantões ficam marcados como indisponível para a gestão resolver.</p>
          </div>
        )}

        <button
          type="submit"
          disabled={salvando}
          className="w-full bg-brand-700 hover:bg-brand-800 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {salvando ? "Salvando..." : "Adicionar período"}
        </button>
      </form>

      {confirmacao && <ConfirmacaoModal confirmacao={confirmacao} onClose={() => setConfirmacao(null)} />}
    </div>
  )
}
