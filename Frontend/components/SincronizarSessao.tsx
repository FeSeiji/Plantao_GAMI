"use client"

import { useEffect } from "react"
import { apiFetch, rolesDaSessao, salvarDadosUsuario, type Me } from "./sessao"

// Os cargos ficam no localStorage desde o login. Ao abrir o app, confere no /auth/me se mudaram
// (ex.: a gestão deu ou tirou a flag admin) e, se sim, salva e recarrega para as telas usarem os novos.
export default function SincronizarSessao() {
  useEffect(() => {
    const token = localStorage.getItem("token")
    if (!token) return

    apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) return
        const me: Me = await res.json()
        const salvos = localStorage.getItem("roles") ?? "[]"
        const mudou = JSON.stringify(rolesDaSessao(me)) !== salvos
        salvarDadosUsuario(me)
        if (mudou) window.location.reload()
      })
      .catch(() => {})
  }, [])

  return null
}
