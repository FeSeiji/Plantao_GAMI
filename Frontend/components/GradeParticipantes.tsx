"use client"

import React, { useEffect, useRef, useState } from "react"
import SiglaBadge from "./SiglaBadge"

export type AcaoMenu = {
  rotulo: string
  onClick: () => void
  perigo?: boolean
}

type Pessoa = {
  id: string
  nome?: string | null
  email?: string | null
  sigla?: string | null
}

export type CelulaGrade =
  | {
      tipo: "medico"
      chave: string
      pessoa: Pessoa
      // Cabeçalho da célula: número da posição, "Coordenador" ou o select de posição
      rotulo?: React.ReactNode
      destaque?: "coordenador" | "pendente" | "indisponivel"
      status?: React.ReactNode
      acoes?: AcaoMenu[]
      // Conteúdo sempre visível abaixo do nome (ex.: Aceitar/Recusar troca)
      extra?: React.ReactNode
      larga?: boolean
    }
  | {
      tipo: "vazia"
      chave: string
      rotulo?: React.ReactNode
      texto: string
      onClick?: () => void
      ativa?: boolean
      larga?: boolean
    }

const CORES = {
  normal: "bg-brand-50 border-brand-100 text-brand-900",
  coordenador: "bg-purple-50 border-purple-300 text-purple-900",
  pendente: "bg-amber-50 border-amber-400 text-amber-900",
  indisponivel: "bg-red-50 border-red-400 text-red-900",
}

export default function GradeParticipantes({ celulas }: { celulas: CelulaGrade[] }) {
  const [menuAberto, setMenuAberto] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuAberto) return

    function handleClickFora(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuAberto(null)
    }

    document.addEventListener("mousedown", handleClickFora)
    document.addEventListener("touchstart", handleClickFora)
    return () => {
      document.removeEventListener("mousedown", handleClickFora)
      document.removeEventListener("touchstart", handleClickFora)
    }
  }, [menuAberto])

  return (
    <div ref={ref} className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {celulas.map((c) => {
        const span = c.larga ? "col-span-full" : ""

        if (c.tipo === "vazia") {
          const conteudo = (
            <>
              {c.rotulo && <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{c.rotulo}</span>}
              {c.onClick && <span className="text-lg leading-none font-bold">+</span>}
              <span className="text-xs">{c.texto}</span>
            </>
          )
          const base = `${span} min-h-[88px] rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 p-2 text-center`

          return c.onClick ? (
            <button
              key={c.chave}
              type="button"
              onClick={c.onClick}
              className={`${base} transition-colors ${
                c.ativa
                  ? "border-brand-600 bg-brand-50 text-brand-700"
                  : "border-gray-200 text-gray-400 hover:border-brand-300 hover:text-brand-700"
              }`}
            >
              {conteudo}
            </button>
          ) : (
            <div key={c.chave} className={`${base} border-gray-100 text-gray-300`}>
              {conteudo}
            </div>
          )
        }

        const acoes = c.acoes ?? []
        const temMenu = acoes.length > 0
        const aberto = menuAberto === c.chave
        const nome = c.pessoa.nome ?? c.pessoa.email ?? c.pessoa.id

        const corpo = (
          <>
            <SiglaBadge sigla={c.pessoa.sigla} />
            <span className="text-xs font-semibold w-full truncate" title={nome}>
              {nome}
            </span>
            {c.status && <span className="text-[10px] italic leading-tight">{c.status}</span>}
          </>
        )

        return (
          <div
            key={c.chave}
            className={`${span} relative min-h-[88px] rounded-xl border p-2 flex flex-col items-center gap-1 text-center ${
              CORES[c.destaque ?? "normal"]
            }`}
          >
            {c.rotulo && <div className="text-[10px] font-bold uppercase tracking-wide">{c.rotulo}</div>}

            {temMenu ? (
              <button
                type="button"
                onClick={() => setMenuAberto(aberto ? null : c.chave)}
                aria-haspopup="menu"
                aria-expanded={aberto}
                className="w-full flex flex-col items-center gap-1 rounded-lg hover:bg-black/5 transition-colors py-0.5"
              >
                {corpo}
              </button>
            ) : (
              <div className="w-full flex flex-col items-center gap-1 py-0.5">{corpo}</div>
            )}

            {c.extra}

            {aberto && (
              <div
                role="menu"
                className="absolute z-20 top-full left-1/2 -translate-x-1/2 mt-1 min-w-[160px] bg-white border border-gray-200 rounded-lg shadow-lg py-1 text-left"
              >
                {acoes.map((a) => (
                  <button
                    key={a.rotulo}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuAberto(null)
                      a.onClick()
                    }}
                    className={`w-full text-left px-3 py-2 text-xs font-medium hover:bg-gray-50 ${
                      a.perigo ? "text-red-600" : "text-gray-700"
                    }`}
                  >
                    {a.rotulo}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
