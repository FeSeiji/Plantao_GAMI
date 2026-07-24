"use client"

import React, { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

export default function ResetPasswordPage() {
  const router = useRouter()
  const [accessToken, setAccessToken] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // O Supabase redireciona com os tokens no fragmento da URL (#access_token=...)
    const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash
    const params = new URLSearchParams(hash)
    const token = params.get("access_token")

    if (token) {
      setAccessToken(token)
    } else {
      setError("Link inválido ou expirado. Solicite uma nova redefinição de senha.")
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    if (password !== confirmPassword) {
      setError("As senhas não coincidem.")
      return
    }

    setLoading(true)

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: accessToken, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? "Não foi possível redefinir a senha.")
        return
      }

      setSuccess(true)
      setTimeout(() => router.push("/login"), 1500)
    } catch {
      setError("Não foi possível conectar ao servidor.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-brand-800 flex flex-col items-center justify-center px-4">
      {/* Logo */}
      <div className="mb-8 text-center">
        <div className="w-14 h-14 bg-white rounded-full flex items-center justify-center mx-auto mb-3 shadow-lg">
          <span className="text-brand-800 font-bold text-2xl">P</span>
        </div>
        <h1 className="text-white font-bold text-2xl tracking-wide">Plantão</h1>
        <p className="text-brand-200 text-sm mt-1">Gestão de Escalas Hospitalares</p>
      </div>

      {/* Card */}
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-8">
        <h2 className="text-gray-800 font-semibold text-xl mb-1">Redefinir senha</h2>
        <p className="text-gray-400 text-sm mb-6">Escolha uma nova senha para sua conta.</p>

        {success ? (
          <p className="text-green-700 text-sm bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            Senha redefinida com sucesso! Redirecionando para o login...
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Nova senha
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent transition"
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                Confirmar nova senha
              </label>
              <input
                id="confirmPassword"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent transition"
              />
            </div>

            {error && (
              <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !accessToken}
              className="w-full bg-brand-700 hover:bg-brand-800 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "Salvando..." : "Redefinir senha"}
            </button>
          </form>
        )}

        <p className="text-center text-sm text-gray-500 mt-6">
          <Link href="/login" className="text-brand-700 font-semibold hover:text-brand-800 transition-colors">
            ← Voltar ao login
          </Link>
        </p>
      </div>
    </div>
  )
}
