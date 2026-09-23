"use client"

import React, { useEffect, useState } from "react"

export type UsuarioGestao = {
  id: string
  nome: string | null
  email: string | null
  sigla: string | null
  crm: string | null
  crm_uf: string | null
  roles: string[]
  ativo: boolean
}

export const ROLES = [
  { value: "anestesita_socio", label: "Anestesista Sócio" },
  { value: "anestesita_plantonista", label: "Anestesista Plantonista" },
  { value: "tecnico", label: "Técnico" },
  { value: "admin", label: "Administrador" },
]

// Quem pode abrir a tela de usuários e quem pode editar (técnico não mexe em admins)
export const ROLES_GESTAO = ["admin", "anestesita_socio", "tecnico"]
export const ROLES_EDICAO = ["admin", "tecnico"]

const ROLES_ANESTESISTA = ["anestesita_socio", "anestesita_plantonista"]

const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
]

const INPUT_CLASS =
  "w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent transition disabled:bg-gray-50 disabled:text-gray-500"

type Props = {
  // null = criar novo usuário
  usuario: UsuarioGestao | null
  // false = esconde a role admin (técnico não pode conceder)
  podeGerenciarAdmin: boolean
  onClose: () => void
  onSaved: () => void
}

export default function UsuarioModal({ usuario, podeGerenciarAdmin, onClose, onSaved }: Props) {
  const criando = usuario === null

  const [nome, setNome] = useState(usuario?.nome ?? "")
  const [sigla, setSigla] = useState(usuario?.sigla ?? "")
  const [email, setEmail] = useState(usuario?.email ?? "")
  const [password, setPassword] = useState("")
  const [roles, setRoles] = useState<string[]>(usuario?.roles ?? [])
  const [crm, setCrm] = useState(usuario?.crm ?? "")
  const [crmUf, setCrmUf] = useState(usuario?.crm_uf ?? "")

  const [error, setError] = useState("")
  const [mensagem, setMensagem] = useState("")
  const [loading, setLoading] = useState(false)
  const [confirmandoAtivo, setConfirmandoAtivo] = useState(false)

  const exigeCrm = roles.some((r) => ROLES_ANESTESISTA.includes(r))

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }

    document.body.style.overflow = "hidden"
    document.addEventListener("keydown", handleKeyDown)

    return () => {
      document.body.style.overflow = ""
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [onClose])

  function alternarRole(role: string) {
    setRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]))
  }

  async function chamarApi(caminho: string, method: string, body?: object) {
    const token = localStorage.getItem("token")
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${caminho}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const result = await res.json()
    if (!res.ok) throw new Error(result.error ?? "Não foi possível concluir a ação.")
    return result
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setMensagem("")

    if (roles.length === 0) {
      setError("Selecione ao menos uma função.")
      return
    }

    setLoading(true)

    const dados = {
      nome,
      sigla,
      roles,
      crm: exigeCrm ? crm : undefined,
      crm_uf: exigeCrm ? crmUf : undefined,
    }

    try {
      if (criando) {
        await chamarApi("/users", "POST", { ...dados, email, password })
      } else {
        await chamarApi(`/users/${usuario.id}`, "PATCH", dados)
      }
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível conectar ao servidor.")
    } finally {
      setLoading(false)
    }
  }

  async function alterarAtivo() {
    if (!usuario) return
    setError("")
    setMensagem("")
    setLoading(true)

    try {
      await chamarApi(`/users/${usuario.id}/ativo`, "PATCH", { ativo: !usuario.ativo })
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível conectar ao servidor.")
    } finally {
      setLoading(false)
      setConfirmandoAtivo(false)
    }
  }

  async function enviarResetSenha() {
    if (!usuario) return
    setError("")
    setMensagem("")
    setLoading(true)

    try {
      const result = await chamarApi(`/users/${usuario.id}/reset-senha`, "POST")
      setMensagem(result.message)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível conectar ao servidor.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-full overflow-y-auto p-6 sm:p-8">
        <div className="flex items-start justify-between mb-1">
          <h1 className="text-xl font-bold text-gray-800">{criando ? "Novo usuário" : "Editar usuário"}</h1>
          <button onClick={onClose} aria-label="Fechar" className="text-gray-400 hover:text-gray-600 p-1 -mr-1 -mt-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <p className="text-gray-400 text-sm mb-6">
          {criando ? "O usuário poderá entrar com o e-mail e a senha definidos aqui." : usuario.email}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-[1fr_auto] gap-4">
            <div>
              <label htmlFor="nome" className="block text-sm font-medium text-gray-700 mb-1">
                Nome
              </label>
              <input id="nome" type="text" required value={nome} onChange={(e) => setNome(e.target.value)} className={INPUT_CLASS} />
            </div>
            <div className="w-20">
              <label htmlFor="sigla" className="block text-sm font-medium text-gray-700 mb-1">
                Sigla
              </label>
              <input
                id="sigla"
                type="text"
                required
                maxLength={2}
                value={sigla}
                onChange={(e) => setSigla(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
                className={`${INPUT_CLASS} text-center uppercase`}
              />
            </div>
          </div>

          {criando && (
            <>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  E-mail
                </label>
                <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT_CLASS} />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  Senha inicial
                </label>
                <input
                  id="password"
                  type="text"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>
            </>
          )}

          <div>
            <span className="block text-sm font-medium text-gray-700 mb-1">Funções</span>
            <div className="grid grid-cols-2 gap-2">
              {ROLES.filter((r) => podeGerenciarAdmin || r.value !== "admin").map((r) => (
                <label
                  key={r.value}
                  className={`flex items-center gap-2 border rounded-lg px-3 py-2 text-sm cursor-pointer transition-colors ${
                    roles.includes(r.value) ? "border-brand-600 bg-brand-50 text-brand-800" : "border-gray-300 text-gray-700"
                  }`}
                >
                  <input type="checkbox" checked={roles.includes(r.value)} onChange={() => alternarRole(r.value)} className="accent-brand-700" />
                  {r.label}
                </label>
              ))}
            </div>
          </div>

          {exigeCrm && (
            <div className="grid grid-cols-[1fr_auto] gap-4">
              <div>
                <label htmlFor="crm" className="block text-sm font-medium text-gray-700 mb-1">
                  CRM
                </label>
                <input
                  id="crm"
                  type="text"
                  inputMode="numeric"
                  required
                  maxLength={7}
                  value={crm}
                  onChange={(e) => setCrm(e.target.value.replace(/\D/g, ""))}
                  className={INPUT_CLASS}
                />
              </div>
              <div className="w-24">
                <label htmlFor="crmUf" className="block text-sm font-medium text-gray-700 mb-1">
                  UF
                </label>
                <select id="crmUf" required value={crmUf} onChange={(e) => setCrmUf(e.target.value)} className={INPUT_CLASS}>
                  <option value="">--</option>
                  {UFS.map((uf) => (
                    <option key={uf} value={uf}>
                      {uf}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          {mensagem && <p className="text-green-700 text-sm bg-green-50 border border-green-200 rounded-lg px-3 py-2">{mensagem}</p>}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-2.5 rounded-lg text-sm transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-brand-700 hover:bg-brand-800 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "Salvando..." : criando ? "Criar usuário" : "Salvar"}
            </button>
          </div>
        </form>

        {!criando && (
          <div className="mt-6 pt-5 border-t border-gray-100 space-y-2">
            <button
              type="button"
              onClick={enviarResetSenha}
              disabled={loading}
              className="w-full text-left text-sm font-medium text-brand-700 hover:text-brand-900 disabled:opacity-60"
            >
              Enviar e-mail de redefinição de senha
            </button>

            {confirmandoAtivo ? (
              <div className="flex items-center gap-3 text-sm">
                <span className="text-gray-700">
                  {usuario.ativo ? "Desativar este usuário? Ele não conseguirá mais entrar." : "Reativar este usuário?"}
                </span>
                <button type="button" onClick={alterarAtivo} disabled={loading} className="font-semibold text-red-600 hover:text-red-800">
                  Confirmar
                </button>
                <button type="button" onClick={() => setConfirmandoAtivo(false)} className="text-gray-500 hover:text-gray-700">
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmandoAtivo(true)}
                disabled={loading}
                className={`w-full text-left text-sm font-medium disabled:opacity-60 ${
                  usuario.ativo ? "text-red-600 hover:text-red-800" : "text-green-700 hover:text-green-900"
                }`}
              >
                {usuario.ativo ? "Desativar usuário" : "Reativar usuário"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
