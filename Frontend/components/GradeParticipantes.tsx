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
      // Coluna da vaga: o rótulo ("3º", "Coord.") ou o select de posição
      rotulo?: React.ReactNode
      destaque?: "coordenador" | "pendente" | "indisponivel"
      status?: React.ReactNode
      acoes?: AcaoMenu[]
      // Conteúdo sempre visível abaixo do nome (ex.: Aceitar/Recusar troca)
      extra?: React.ReactNode
    }
  | {
      tipo: "vazia"
      chave: string
      rotulo?: React.ReactNode
      texto: string
      onClick?: () => void
      // Texto da ação à direita (padrão: "+ Adicionar")
      acao?: string
      ativa?: boolean
      // Pedido de vaga pendente: a linha fica em destaque, com o aviso e os botões embaixo do texto
      destaque?: "pendente"
      status?: React.ReactNode
      extra?: React.ReactNode
    }

// Fundo da linha, traço colorido à esquerda e cor do aviso (status)
const CORES = {
  normal: { fundo: "", faixa: "", status: "text-gray-500" },
  coordenador: { fundo: "bg-purple-50/60", faixa: "bg-purple-400", status: "text-purple-800" },
  pendente: { fundo: "bg-amber-50", faixa: "bg-amber-400", status: "text-amber-800" },
  indisponivel: { fundo: "bg-red-50", faixa: "bg-red-400", status: "text-red-700" },
}

// Coluna da vaga ("Coord.", "2º" ou o select de posição): mesma largura em todas as linhas
const COLUNA_VAGA = "w-[4.5rem] shrink-0 min-w-0 text-xs font-medium"
const LINHA = "relative flex items-center gap-3 px-3 py-2 first:rounded-t-xl last:rounded-b-xl"

function Faixa({ cor }: { cor: string }) {
  return cor ? <span className={`absolute left-0 top-2 bottom-2 w-1 rounded-r ${cor}`} /> : null
}

// Participantes do plantão em lista: uma linha por vaga, na ordem da escala
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
    <div ref={ref} className="border border-gray-200 rounded-xl divide-y divide-gray-100">
      {celulas.map((c) => {
        if (c.tipo === "vazia") {
          const cor = c.destaque ? CORES[c.destaque] : null
          const textoAcao = c.acao ?? "+ Adicionar"
          const miolo = (
            <>
              <span className={`${COLUNA_VAGA} text-gray-400`}>{c.rotulo}</span>
              <span className="w-6 h-6 rounded-full border-2 border-dashed border-gray-200 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm">{c.texto}</p>
                {c.status && <div className={`text-xs leading-snug mt-0.5 ${cor?.status ?? "text-gray-500"}`}>{c.status}</div>}
                {c.extra && <div className="mt-1">{c.extra}</div>}
              </div>
            </>
          )

          // Com botões dentro (Aprovar/Recusar), a linha não pode ser um botão: a ação vira um botão à direita
          if (c.extra) {
            return (
              <div key={c.chave} className={`${LINHA} ${cor?.fundo ?? ""} text-gray-400`}>
                {cor && <Faixa cor={cor.faixa} />}
                {miolo}
                {c.onClick && (
                  <button type="button" onClick={c.onClick} className="shrink-0 text-xs font-semibold text-brand-700 hover:text-brand-900">
                    {textoAcao}
                  </button>
                )}
              </div>
            )
          }

          return c.onClick ? (
            <button
              key={c.chave}
              type="button"
              onClick={c.onClick}
              className={`${LINHA} w-full text-left transition-colors ${
                c.ativa ? "bg-brand-50 text-brand-700" : `${cor?.fundo ?? ""} text-gray-400 hover:bg-gray-50`
              }`}
            >
              {c.ativa ? <Faixa cor="bg-brand-600" /> : cor && <Faixa cor={cor.faixa} />}
              {miolo}
              <span className="shrink-0 text-xs font-semibold text-brand-700">{textoAcao}</span>
            </button>
          ) : (
            <div key={c.chave} className={`${LINHA} ${cor?.fundo ?? ""} text-gray-300`}>
              {cor && <Faixa cor={cor.faixa} />}
              {miolo}
            </div>
          )
        }

        const acoes = c.acoes ?? []
        const aberto = menuAberto === c.chave
        const nome = c.pessoa.nome ?? c.pessoa.email ?? c.pessoa.id
        const cor = CORES[c.destaque ?? "normal"]

        return (
          <div key={c.chave} className={`${LINHA} ${cor.fundo}`}>
            <Faixa cor={cor.faixa} />
            <div className={`${COLUNA_VAGA} text-gray-500`}>{c.rotulo}</div>
            <SiglaBadge sigla={c.pessoa.sigla} size="sm" />

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate" title={nome}>
                {nome}
              </p>
              {c.status && <div className={`text-xs leading-snug mt-0.5 ${cor.status}`}>{c.status}</div>}
              {c.extra && <div className="mt-1">{c.extra}</div>}
            </div>

            {/* O menu abre logo abaixo do botão, alinhado pela direita */}
            {acoes.length > 0 && (
              <div className="relative shrink-0 -mr-1.5">
                <button
                  type="button"
                  onClick={() => setMenuAberto(aberto ? null : c.chave)}
                  aria-label={`Ações de ${nome}`}
                  aria-haspopup="menu"
                  aria-expanded={aberto}
                  className={`p-1.5 rounded-md transition-colors ${
                    aberto ? "bg-black/5 text-gray-700" : "text-gray-400 hover:text-gray-700 hover:bg-black/5"
                  }`}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <circle cx="5" cy="12" r="2" />
                    <circle cx="12" cy="12" r="2" />
                    <circle cx="19" cy="12" r="2" />
                  </svg>
                </button>

                {aberto && (
                  <div
                    role="menu"
                    className="absolute z-20 top-full right-0 mt-1 min-w-[160px] bg-white border border-gray-200 rounded-lg shadow-lg py-1 text-left"
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
            )}
          </div>
        )
      })}
    </div>
  )
}
