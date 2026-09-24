"use client"

import React, { useState } from "react"

export type Confirmacao = {
  titulo: string
  mensagem: React.ReactNode
  rotuloConfirmar: string
  perigo?: boolean
  acao: () => Promise<void>
}

type Props = {
  confirmacao: Confirmacao
  onClose: () => void
}

// Abre por cima de outro modal (z-60) para confirmar ações que mexem na equipe/fila
export default function ConfirmacaoModal({ confirmacao, onClose }: Props) {
  const [executando, setExecutando] = useState(false)

  async function confirmar() {
    setExecutando(true)
    try {
      await confirmacao.acao()
    } finally {
      setExecutando(false)
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4" role="alertdialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={executando ? undefined : onClose} />

      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-lg font-bold text-gray-800 mb-2">{confirmacao.titulo}</h2>
        <div className="text-sm text-gray-600 mb-6">{confirmacao.mensagem}</div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={executando}
            className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={executando}
            autoFocus
            className={`flex-1 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60 ${
              confirmacao.perigo ? "bg-red-600 hover:bg-red-700" : "bg-brand-700 hover:bg-brand-800"
            }`}
          >
            {executando ? "Aguarde..." : confirmacao.rotuloConfirmar}
          </button>
        </div>
      </div>
    </div>
  )
}
