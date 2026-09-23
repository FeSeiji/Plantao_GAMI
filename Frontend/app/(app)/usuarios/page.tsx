"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import SiglaBadge from "../../../components/SiglaBadge"
import UsuarioModal, { ROLES, ROLES_EDICAO, ROLES_GESTAO, UsuarioGestao } from "../../../components/UsuarioModal"

const ROTULO_ROLE = Object.fromEntries(ROLES.map((r) => [r.value, r.label]))

function lerRoles(): string[] {
  try {
    return JSON.parse(localStorage.getItem("roles") ?? "[]")
  } catch {
    return []
  }
}

export default function UsuariosPage() {
  const router = useRouter()
  const [usuarios, setUsuarios] = useState<UsuarioGestao[]>([])
  const [busca, setBusca] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [podeEditar, setPodeEditar] = useState(false)
  // undefined = modal fechado, null = criando novo usuário
  const [selecionado, setSelecionado] = useState<UsuarioGestao | null | undefined>(undefined)

  const carregarUsuarios = useCallback(() => {
    const token = localStorage.getItem("token")
    if (!token) return

    setLoading(true)
    const params = new URLSearchParams()
    if (busca.trim()) params.set("search", busca.trim())
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/users/gestao?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? "Não foi possível carregar os usuários.")
        setUsuarios(data)
        setError("")
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [busca])

  useEffect(() => {
    if (!localStorage.getItem("token")) {
      router.push("/login")
      return
    }

    const roles = lerRoles()
    if (!roles.some((r) => ROLES_GESTAO.includes(r))) {
      router.push("/dashboard")
      return
    }
    setIsAdmin(roles.includes("admin"))
    setPodeEditar(roles.some((r) => ROLES_EDICAO.includes(r)))
  }, [router])

  useEffect(() => {
    const timeoutId = setTimeout(carregarUsuarios, 300)
    return () => clearTimeout(timeoutId)
  }, [carregarUsuarios])

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-xl font-bold text-gray-800">Usuários</h1>

        <div className="flex items-center gap-3">
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou e-mail"
            className="w-56 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent transition"
          />
          {podeEditar && (
            <button
              onClick={() => setSelecionado(null)}
              className="bg-brand-700 hover:bg-brand-800 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              + Novo usuário
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-6">{error}</p>
      )}

      <div className={`bg-white rounded-xl border border-gray-200 overflow-x-auto ${loading ? "opacity-60" : ""} transition-opacity`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-200">
              <th className="px-4 py-3">Usuário</th>
              <th className="px-4 py-3">Funções</th>
              <th className="px-4 py-3">CRM</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => {
              // Técnico edita usuários, mas não administradores
              const editavel = podeEditar && (isAdmin || !u.roles.includes("admin"))
              return (
                <tr
                  key={u.id}
                  onClick={editavel ? () => setSelecionado(u) : undefined}
                  className={`border-b border-gray-100 last:border-0 ${editavel ? "cursor-pointer hover:bg-gray-50" : ""} ${
                    u.ativo ? "" : "opacity-50"
                  }`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <SiglaBadge sigla={u.sigla} />
                      <div className="min-w-0">
                        <p className="font-medium text-gray-800 truncate">{u.nome ?? "—"}</p>
                        <p className="text-gray-400 text-xs truncate">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {u.roles.length === 0 ? (
                        <span className="text-gray-400">—</span>
                      ) : (
                        u.roles.map((r) => (
                          <span key={r} className="bg-brand-100 text-brand-800 text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap">
                            {ROTULO_ROLE[r] ?? r}
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{u.crm ? `${u.crm}/${u.crm_uf}` : "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        u.ativo ? "bg-green-100 text-green-800" : "bg-gray-200 text-gray-600"
                      }`}
                    >
                      {u.ativo ? "Ativo" : "Desativado"}
                    </span>
                  </td>
                </tr>
              )
            })}
            {!loading && usuarios.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                  Nenhum usuário encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selecionado !== undefined && (
        <UsuarioModal usuario={selecionado} podeGerenciarAdmin={isAdmin} onClose={() => setSelecionado(undefined)} onSaved={carregarUsuarios} />
      )}
    </main>
  )
}
