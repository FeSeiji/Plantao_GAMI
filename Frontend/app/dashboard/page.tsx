"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

const ROLE_LABELS: Record<string, string> = {
  anestesita_socio: "Anestesista Sócio",
  anestesita_plantonista: "Anestesista Plantonista",
  tecnico: "Técnico",
  coordenador: "Coordenador",
  admin: "Administrador",
}

export default function DashboardPage() {
  const router = useRouter()
  const [email, setEmail] = useState<string | null>(null)
  const [nome, setNome] = useState<string | null>(null)
  const [roles, setRoles] = useState<string[]>([])

  useEffect(() => {
    const token = localStorage.getItem("token")

    if (!token) {
      router.push("/login")
      return
    }

    setEmail(localStorage.getItem("email"))
    setNome(localStorage.getItem("nome"))
    setRoles(JSON.parse(localStorage.getItem("roles") ?? "[]"))
  }, [router])

  function handleLogout() {
    localStorage.removeItem("token")
    localStorage.removeItem("roles")
    localStorage.removeItem("email")
    localStorage.removeItem("nome")
    router.push("/login")
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-brand-800 shadow-md">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center">
              <span className="text-brand-800 font-bold text-sm">P</span>
            </div>
            <span className="text-white font-semibold text-lg tracking-wide">Plantão</span>
          </div>
          <button
            onClick={handleLogout}
            className="bg-white text-brand-800 text-sm font-semibold px-5 py-2 rounded-md hover:bg-brand-50 transition-colors"
          >
            Sair
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-lg">
          <h1 className="text-xl font-bold text-gray-800 mb-1">
            Bem-vindo(a){nome ? `, ${nome}` : ""}
          </h1>
          <p className="text-gray-500 text-sm mb-6">{email}</p>

          <p className="text-sm font-medium text-gray-700 mb-2">Seus perfis de acesso</p>
          {roles.length === 0 ? (
            <p className="text-gray-400 text-sm">Nenhum perfil atribuído.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {roles.map((role) => (
                <span
                  key={role}
                  className="bg-brand-100 text-brand-800 text-xs font-semibold px-3 py-1.5 rounded-full"
                >
                  {ROLE_LABELS[role] ?? role}
                </span>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
