"use client"

import { useEffect, useState } from "react"

type ViewportVisivel = { altura: number; topo: number } | null

// No celular o teclado cobre a tela sem encolher elementos `fixed inset-0`.
// O visualViewport informa a área realmente visível, para o modal caber acima do teclado.
// Também trava o scroll da página de fundo enquanto o modal está aberto.
export function useViewportVisivel(): ViewportVisivel {
  const [viewport, setViewport] = useState<ViewportVisivel>(null)

  useEffect(() => {
    const overflowAnterior = document.body.style.overflow
    document.body.style.overflow = "hidden"

    const vv = window.visualViewport
    if (!vv) {
      return () => {
        document.body.style.overflow = overflowAnterior
      }
    }

    const atualizar = () => setViewport({ altura: vv.height, topo: vv.offsetTop })
    atualizar()
    vv.addEventListener("resize", atualizar)
    vv.addEventListener("scroll", atualizar)

    return () => {
      vv.removeEventListener("resize", atualizar)
      vv.removeEventListener("scroll", atualizar)
      document.body.style.overflow = overflowAnterior
    }
  }, [])

  return viewport
}
