"use client"

import { useEffect, useState } from "react"
import { interpretarNumero } from "./calculos"

type Props = {
  valor: number | null
  onChange: (valor: number | null) => void
  // Casas decimais na exibição (2 para dinheiro; o fator de correção usa até 4)
  casas?: number
  minimoCasas?: number
  placeholder?: string
  ariaLabel: string
  className?: string
}

// Campo de número no formato brasileiro ("1.234,56"). Enquanto digita, o texto fica como a pessoa escreveu e
// o valor só muda quando o texto é um número; ao sair do campo, volta formatado
export default function CampoNumero({ valor, onChange, casas = 2, minimoCasas = casas, placeholder, ariaLabel, className = "" }: Props) {
  const formatar = (v: number | null) =>
    v == null ? "" : v.toLocaleString("pt-BR", { minimumFractionDigits: minimoCasas, maximumFractionDigits: casas })
  const [texto, setTexto] = useState(formatar(valor))
  const [focado, setFocado] = useState(false)

  useEffect(() => {
    if (!focado) setTexto(formatar(valor))
    // formatar depende só das casas, que não mudam
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor, focado])

  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={texto}
      onFocus={(e) => {
        setFocado(true)
        e.target.select()
      }}
      onChange={(e) => {
        setTexto(e.target.value)
        const numero = interpretarNumero(e.target.value)
        if (numero !== undefined) onChange(numero)
      }}
      onBlur={() => setFocado(false)}
      className={`w-full min-w-0 text-right tabular-nums border border-gray-200 rounded px-1.5 py-1 text-sm text-gray-900 placeholder-gray-300 bg-amber-50/40 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent ${className}`}
    />
  )
}
