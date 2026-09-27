"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import SiglaBadge from "./SiglaBadge"
import { ROLES } from "./UsuarioModal"
import { limparSessao } from "./sessao"

type Perfil = {
  nome: string | null
  email: string | null
  sigla: string | null
  roles: string[]
}

function rotuloRole(role: string) {
  return ROLES.find((r) => r.value === role)?.label ?? role
}

export default function UsuarioAtualBadge() {
  const router = useRouter()
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [aberto, setAberto] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let roles: string[] = []
    try {
      roles = JSON.parse(localStorage.getItem("roles") ?? "[]")
    } catch {
      roles = []
    }
    setPerfil({
      nome: localStorage.getItem("nome") || null,
      email: localStorage.getItem("email") || null,
      sigla: localStorage.getItem("sigla") || null,
      roles,
    })
  }, [])

  useEffect(() => {
    function handleClickFora(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setAberto(false)
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setAberto(false)
    }
    document.addEventListener("mousedown", handleClickFora)
    document.addEventListener("keydown", handleEsc)
    return () => {
      document.removeEventListener("mousedown", handleClickFora)
      document.removeEventListener("keydown", handleEsc)
    }
  }, [])

  function handleLogout() {
    limparSessao()
    router.push("/login")
  }

  if (!perfil) return null

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-label="Menu do perfil"
        aria-expanded={aberto}
        className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 hover:opacity-90 transition-opacity"
      >
        <SiglaBadge sigla={perfil.sigla} />
      </button>

      {aberto && (
        <div className="absolute right-0 mt-2 w-72 max-w-[90vw] bg-white border border-gray-200 rounded-xl shadow-lg z-50">
          <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-100">
            <SiglaBadge sigla={perfil.sigla} />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-800 truncate">{perfil.nome || "Sem nome"}</p>
              {perfil.email && <p className="text-xs text-gray-500 truncate">{perfil.email}</p>}
            </div>
          </div>

          {perfil.roles.length > 0 && (
            <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap gap-1.5">
              {perfil.roles.map((role) => (
                <span key={role} className="text-xs font-medium bg-brand-50 text-brand-800 rounded-full px-2.5 py-1">
                  {rotuloRole(role)}
                </span>
              ))}
            </div>
          )}

          <div className="p-1.5">
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center gap-2 text-left rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Sair
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
