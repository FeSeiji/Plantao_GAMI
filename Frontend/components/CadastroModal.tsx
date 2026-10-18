"use client"

import React, { useEffect, useState } from "react"
import { INPUT_CLASS } from "./UsuarioModal"
import { apiFetch } from "./sessao"
import { Cadastro, formatarCnpj } from "./casosFora"

type Props = {
  // "Hospitais" / "Convênios"
  titulo: string
  // "/hospitais" / "/convenios"
  caminho: string
  // "hospital" / "convênio", nos textos dos campos
  item: string
  descricao: string
  onClose: () => void
  // Avisa a tela quando algo mudou (o nome aparece na lista de casos e de fichas)
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

const ordenar = (lista: Cadastro[]) => [...lista].sort((a, b) => (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR"))
// O CNPJ vai só com os dígitos; vazio = sem CNPJ
const digitos = (cnpj: string) => cnpj.replace(/\D/g, "") || null

// Cadastro de hospitais ou convênios (só a gestão), com nome e CNPJ. Desativar tira o item da lista
// dos novos registros; os antigos continuam com ele.
export default function CadastroModal({ titulo, caminho, item, descricao, onClose, onChanged }: Props) {
  const [itens, setItens] = useState<Cadastro[]>([])
  const [carregando, setCarregando] = useState(true)
  const [novoNome, setNovoNome] = useState("")
  const [novoCnpj, setNovoCnpj] = useState("")
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [nomeEditado, setNomeEditado] = useState("")
  const [cnpjEditado, setCnpjEditado] = useState("")
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    chamarApi(caminho)
      .then((lista) => setItens(ordenar(lista)))
      .catch((err) => setError(err.message))
      .finally(() => setCarregando(false))
  }, [caminho])

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
      const criado: Cadastro = await chamarApi(caminho, "POST", { nome: novoNome.trim(), cnpj: digitos(novoCnpj) })
      setItens((prev) => ordenar([...prev, criado]))
      setNovoNome("")
      setNovoCnpj("")
    })
  }

  function atualizar(id: string, alteracoes: { nome?: string; cnpj?: string | null; ativo?: boolean }) {
    executar(async () => {
      const atualizado: Cadastro = await chamarApi(`${caminho}/${id}`, "PATCH", alteracoes)
      setItens((prev) => ordenar(prev.map((h) => (h.id === id ? atualizado : h))))
      setEditandoId(null)
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-full flex flex-col">
        <div className="shrink-0 flex items-start justify-between px-6 sm:px-8 pt-6 pb-2">
          <div>
            <h1 className="text-xl font-bold text-gray-800">{titulo}</h1>
            <p className="text-gray-400 text-sm mt-1">{descricao}</p>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="text-gray-400 hover:text-gray-600 p-1 -mr-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form onSubmit={adicionar} className="shrink-0 grid grid-cols-[1fr_auto] gap-2 px-6 sm:px-8 py-3">
          <input
            type="text"
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            maxLength={100}
            placeholder={`Nome do novo ${item}`}
            aria-label={`Nome do novo ${item}`}
            className={INPUT_CLASS}
          />
          <button
            type="submit"
            disabled={ocupado || !novoNome.trim()}
            className="row-span-2 shrink-0 bg-brand-700 hover:bg-brand-800 text-white text-sm font-semibold px-4 rounded-lg transition-colors disabled:opacity-50"
          >
            Adicionar
          </button>
          <input
            type="text"
            inputMode="numeric"
            value={novoCnpj}
            onChange={(e) => setNovoCnpj(formatarCnpj(e.target.value))}
            placeholder="CNPJ (opcional)"
            aria-label={`CNPJ do novo ${item}`}
            className={INPUT_CLASS}
          />
        </form>

        {error && <p className="mx-6 sm:mx-8 mb-2 text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

        <ul className="flex-1 min-h-0 overflow-y-auto px-6 sm:px-8 pb-6 divide-y divide-gray-100">
          {carregando && <li className="py-3 text-sm text-gray-400">Carregando...</li>}
          {!carregando && itens.length === 0 && <li className="py-3 text-sm text-gray-400">Nenhum {item} cadastrado.</li>}
          {itens.map((h) =>
            editandoId === h.id ? (
              <li key={h.id} className="py-2">
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (nomeEditado.trim()) atualizar(h.id, { nome: nomeEditado.trim(), cnpj: digitos(cnpjEditado) })
                  }}
                  className="grid grid-cols-[1fr_auto_auto] gap-2"
                >
                  <input
                    type="text"
                    autoFocus
                    value={nomeEditado}
                    onChange={(e) => setNomeEditado(e.target.value)}
                    maxLength={100}
                    aria-label={`Nome do ${item}`}
                    className={INPUT_CLASS}
                  />
                  <button
                    type="submit"
                    disabled={ocupado || !nomeEditado.trim()}
                    className="row-span-2 shrink-0 text-sm font-semibold text-brand-700 hover:text-brand-800 px-2 disabled:opacity-50"
                  >
                    Salvar
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditandoId(null)}
                    className="row-span-2 shrink-0 text-sm font-medium text-gray-500 hover:text-gray-700 px-1"
                  >
                    Cancelar
                  </button>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={cnpjEditado}
                    onChange={(e) => setCnpjEditado(formatarCnpj(e.target.value))}
                    placeholder="CNPJ (opcional)"
                    aria-label={`CNPJ do ${item}`}
                    className={INPUT_CLASS}
                  />
                </form>
              </li>
            ) : (
              <li key={h.id} className="flex items-center gap-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className={`truncate text-sm ${h.ativo ? "text-gray-800" : "text-gray-400 line-through"}`}>{h.nome}</p>
                  <p className="text-xs text-gray-400">{h.cnpj ? formatarCnpj(h.cnpj) : "Sem CNPJ"}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditandoId(h.id)
                    setNomeEditado(h.nome ?? "")
                    setCnpjEditado(h.cnpj ? formatarCnpj(h.cnpj) : "")
                  }}
                  disabled={ocupado}
                  className="text-xs font-medium text-brand-700 hover:text-brand-800 disabled:opacity-50"
                >
                  Editar
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
