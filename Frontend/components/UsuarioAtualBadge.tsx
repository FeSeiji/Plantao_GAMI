"use client"

import { useEffect, useState } from "react"
import SiglaBadge from "./SiglaBadge"

export default function UsuarioAtualBadge() {
  const [sigla, setSigla] = useState<string | null>(null)

  useEffect(() => {
    setSigla(localStorage.getItem("sigla") || null)
  }, [])

  if (!sigla) return null

  return <SiglaBadge sigla={sigla} />
}
