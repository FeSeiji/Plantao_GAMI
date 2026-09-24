"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { ROLES_GESTAO } from "./UsuarioModal"

const NAV_ITEMS = [
  { label: "Plantões", href: "/plantoes" },
  { label: "Usuários", href: "/usuarios", roles: ROLES_GESTAO },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [roles, setRoles] = useState<string[]>([])

  useEffect(() => {
    try {
      setRoles(JSON.parse(localStorage.getItem("roles") ?? "[]"))
    } catch {
      setRoles([])
    }
  }, [])

  const navItems = NAV_ITEMS.filter((item) => !item.roles || item.roles.some((r) => roles.includes(r)))

  function handleLogout() {
    localStorage.removeItem("token")
    localStorage.removeItem("roles")
    localStorage.removeItem("email")
    localStorage.removeItem("nome")
    localStorage.removeItem("sigla")
    router.push("/login")
  }

  return (
    <>
      {/* Barra superior — só no mobile */}
      <div className="md:hidden flex items-center justify-between bg-brand-800 px-4 py-3">
        <Link
          href="/dashboard"
          onClick={() => setOpen(false)}
          aria-label="Voltar para o dashboard"
          className="flex items-center gap-3"
        >
          <Image src="/logo.png" alt="GAMI" width={167} height={187} className="h-8 w-auto shrink-0" />
          <span className="text-white font-semibold tracking-wide">Plantão</span>
        </Link>
        <button
          onClick={() => setOpen(true)}
          aria-label="Abrir menu"
          className="text-white p-2 -mr-2"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      </div>

      {/* Fundo escurecido ao abrir o menu no mobile */}
      {open && (
        <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={() => setOpen(false)} />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-brand-800 flex flex-col transform transition-transform duration-200 ease-out md:static md:z-auto md:w-56 md:translate-x-0 md:min-h-screen md:shrink-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 py-5">
          <Link
            href="/dashboard"
            onClick={() => setOpen(false)}
            aria-label="Voltar para o dashboard"
            className="flex items-center gap-3"
          >
            <Image src="/logo.png" alt="GAMI" width={167} height={187} className="h-9 w-auto shrink-0" />
            <span className="text-white font-semibold text-lg tracking-wide">Plantão</span>
          </Link>
          <button onClick={() => setOpen(false)} aria-label="Fechar menu" className="text-white p-1 md:hidden">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 px-3 py-2 space-y-1">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`block rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  active ? "bg-white text-brand-800" : "text-brand-100 hover:bg-brand-700 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="px-3 py-4 border-t border-brand-700">
          <button
            onClick={handleLogout}
            className="w-full text-left rounded-lg px-3 py-2.5 text-sm font-medium text-brand-100 hover:bg-brand-700 hover:text-white transition-colors"
          >
            Sair
          </button>
        </div>
      </aside>
    </>
  )
}
