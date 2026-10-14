"use client"

import React, { useEffect, useState } from "react"
import { INPUT_CLASS } from "./UsuarioModal"
import { apiFetch } from "./sessao"
import { Hospital } from "./casosFora"

type Props = {
  onClose: () => void
  // Avisa a tela quando algo mudou (nome de hospital aparece na lista de casos)
  onChanged: () => void
}

async function chamarApi(caminho: string, metodo = "GET", body?: unknown) {
  const token = localStorage.getItem("token")
  const res = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL}${caminho}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const result = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(result.error ?? "Não foi possível concluir a ação.")
  return result
}

const ordenar = (lista: Hospital[]) => [...lista].sort((a, b) => (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR"))

// Cadastro de hospitais dos casos fora (só a gestão). Desativar tira o hospital do dropdown
// dos novos casos; os casos antigos continuam com ele.
export default function HospitaisModal({ onClose, onChanged }: Props) {
  const [hospitais, setHospitais] = useState<Hospital[]>([])
  const [carregando, setCarregando] = useState(true)
  const [novoNome, setNovoNome] = useState("")
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [nomeEditado, setNomeEditado] = useState("")
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    chamarApi("/hospitais")
      .then((lista) => setHospitais(ordenar(lista)))
      .catch((err) => setError(err.message))
      .finally(() => setCarregando(false))
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

  async function executar(acao: () => Promise<void>) {
    setError("")
    setOcupado(true)
    try {
      await acao()
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível concluir a ação.")
    } finally {
      setOcupado(false)
    }
  }

  function adicionar(e: React.FormEvent) {
    e.preventDefault()
    if (!novoNome.trim()) return
    executar(async () => {
      const criado: Hospital = await chamarApi("/hospitais", "POST", { nome: novoNome.trim() })
      setHospitais((prev) => ordenar([...prev, criado]))
      setNovoNome("")
    })
  }

  function atualizar(id: string, alteracoes: { nome?: string; ativo?: boolean }) {
    executar(async () => {
      const atualizado: Hospital = await chamarApi(`/hospitais/${id}`, "PATCH", alteracoes)
      setHospitais((prev) => ordenar(prev.map((h) => (h.id === id ? atualizado : h))))
      setEditandoId(null)
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-full flex flex-col">
        <div className="shrink-0 flex items-start justify-between px-6 sm:px-8 pt-6 pb-2">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Hospitais</h1>
            <p className="text-gray-400 text-sm mt-1">Os hospitais desativados saem da lista dos novos casos.</p>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="text-gray-400 hover:text-gray-600 p-1 -mr-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form onSubmit={adicionar} className="shrink-0 flex gap-2 px-6 sm:px-8 py-3">
          <input
            type="text"
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            maxLength={100}
            placeholder="Nome do novo hospital"
            aria-label="Nome do novo hospital"
            className={INPUT_CLASS}
          />
          <button
            type="submit"
            disabled={ocupado || !novoNome.trim()}
            className="shrink-0 bg-brand-700 hover:bg-brand-800 text-white text-sm font-semibold px-4 rounded-lg transition-colors disabled:opacity-50"
          >
            Adicionar
          </button>
        </form>

        {error && <p className="mx-6 sm:mx-8 mb-2 text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

        <ul className="flex-1 min-h-0 overflow-y-auto px-6 sm:px-8 pb-6 divide-y divide-gray-100">
          {carregando && <li className="py-3 text-sm text-gray-400">Carregando...</li>}
          {!carregando && hospitais.length === 0 && <li className="py-3 text-sm text-gray-400">Nenhum hospital cadastrado.</li>}
          {hospitais.map((h) =>
            editandoId === h.id ? (
              <li key={h.id} className="py-2">
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (nomeEditado.trim()) atualizar(h.id, { nome: nomeEditado.trim() })
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    autoFocus
                    value={nomeEditado}
                    onChange={(e) => setNomeEditado(e.target.value)}
                    maxLength={100}
                    aria-label="Novo nome do hospital"
                    className={INPUT_CLASS}
                  />
                  <button
                    type="submit"
                    disabled={ocupado || !nomeEditado.trim()}
                    className="shrink-0 text-sm font-semibold text-brand-700 hover:text-brand-800 px-2 disabled:opacity-50"
                  >
                    Salvar
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditandoId(null)}
                    className="shrink-0 text-sm font-medium text-gray-500 hover:text-gray-700 px-1"
                  >
                    Cancelar
                  </button>
                </form>
              </li>
            ) : (
              <li key={h.id} className="flex items-center gap-3 py-2.5">
                <span className={`flex-1 min-w-0 truncate text-sm ${h.ativo ? "text-gray-800" : "text-gray-400 line-through"}`}>
                  {h.nome}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setEditandoId(h.id)
                    setNomeEditado(h.nome ?? "")
                  }}
                  disabled={ocupado}
                  className="text-xs font-medium text-brand-700 hover:text-brand-800 disabled:opacity-50"
                >
                  Renomear
                </button>
                <button
                  type="button"
                  onClick={() => atualizar(h.id, { ativo: !h.ativo })}
                  disabled={ocupado}
                  className={`text-xs font-medium disabled:opacity-50 ${
                    h.ativo ? "text-red-600 hover:text-red-700" : "text-green-700 hover:text-green-800"
                  }`}
                >
                  {h.ativo ? "Desativar" : "Reativar"}
                </button>
              </li>
            ),
          )}
        </ul>
      </div>
    </div>
  )
}
