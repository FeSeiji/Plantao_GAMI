"use client"

import React, { useState } from "react"
import { useRouter } from "next/navigation"
import { INPUT_CLASS } from "./UsuarioModal"
import { apiFetch, limparSessao, salvarTokens } from "./sessao"

// Mesmo mínimo do cadastro e do backend
const TAMANHO_MINIMO_SENHA = 8

export default function TrocarSenha() {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [senhaAtual, setSenhaAtual] = useState("")
  const [novaSenha, setNovaSenha] = useState("")
  const [confirmacao, setConfirmacao] = useState("")
  const [error, setError] = useState("")
  const [mensagem, setMensagem] = useState("")
  const [loading, setLoading] = useState(false)

  function fechar() {
    setSenhaAtual("")
    setNovaSenha("")
    setConfirmacao("")
    setError("")
    setAberto(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    if (novaSenha !== confirmacao) {
      setError("A confirmação não bate com a nova senha.")
      return
    }

    setLoading(true)

    try {
      const token = localStorage.getItem("token")
      const res = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/me/senha`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ senha_atual: senhaAtual, nova_senha: novaSenha }),
      })

      const result = await res.json()

      if (!res.ok) {
        setError(result.error ?? "Não foi possível trocar a senha.")
        return
      }

      // A troca encerra as sessões antigas; a resposta traz a nova. Sem ela, é preciso entrar de novo.
      if (!result.token) {
        limparSessao()
        router.push("/login")
        return
      }
      salvarTokens(result)
      fechar()
      setMensagem("Senha alterada. Use a nova senha no próximo acesso.")
    } catch {
      setError("Não foi possível conectar ao servidor.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 sm:p-8 mt-6">
      <h2 className="font-semibold text-gray-800">Senha</h2>
      <p className="text-sm text-gray-500 mt-1 mb-5">
        Ao trocar, você continua conectado aqui, mas precisa entrar de novo nos outros aparelhos.
      </p>

      {aberto ? (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="senhaAtual" className="block text-sm font-medium text-gray-700 mb-1">
              Senha atual
            </label>
            <input
              id="senhaAtual"
              type="password"
              required
              autoComplete="current-password"
              value={senhaAtual}
              onChange={(e) => setSenhaAtual(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="novaSenha" className="block text-sm font-medium text-gray-700 mb-1">
                Nova senha
              </label>
              <input
                id="novaSenha"
                type="password"
                required
                minLength={TAMANHO_MINIMO_SENHA}
                autoComplete="new-password"
                placeholder={`Mínimo ${TAMANHO_MINIMO_SENHA} caracteres`}
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label htmlFor="confirmacao" className="block text-sm font-medium text-gray-700 mb-1">
                Confirmar nova senha
              </label>
              <input
                id="confirmacao"
                type="password"
                required
                minLength={TAMANHO_MINIMO_SENHA}
                autoComplete="new-password"
                value={confirmacao}
                onChange={(e) => setConfirmacao(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
          </div>

          {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={fechar}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-2.5 rounded-lg text-sm transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-brand-700 hover:bg-brand-800 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "Salvando..." : "Trocar senha"}
            </button>
          </div>
        </form>
      ) : (
        <>
          {mensagem && (
            <p className="text-green-700 text-sm bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-4">{mensagem}</p>
          )}
          <button
            type="button"
            onClick={() => {
              setMensagem("")
              setAberto(true)
            }}
            className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-2.5 rounded-lg text-sm transition-colors"
          >
            Trocar senha
          </button>
        </>
      )}
    </div>
  )
}
