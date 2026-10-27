"use client"

import React, { useState } from "react"
import CampoNumero from "./CampoNumero"
import { Despesa, Empresa, ResultadoFinanceiro, formatarDinheiro } from "./calculos"

const EMPRESAS: { valor: Empresa; rotulo: string }[] = [
  { valor: "pmp", rotulo: "Despesas PMP" },
  { valor: "gami", rotulo: "Despesas GAMI" },
]

type Props = {
  despesas: Despesa[]
  resultado: ResultadoFinanceiro
  podeEditar: boolean
  onEditar: (itemId: string, campos: Partial<Pick<Despesa, "banco" | "data_pago" | "valor">>) => void
  onAdicionar: (empresa: Empresa, nome: string) => Promise<void>
  onRenomear: (despesa: Despesa, nome: string) => Promise<void>
  onRemover: (despesa: Despesa) => void
  onCopiarMesAnterior: () => void
  copiando: boolean
}

const ROTULO_CALCULO = { produtividade: "0,1% do faturamento", plantonistas: "plantões × valor" }

function formatarData(data: string | null) {
  return data ? `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(0, 4)}` : ""
}

// Despesas da PMP e da GAMI do mês, lado a lado, como nas colunas da planilha (linhas 82 a 126).
// Quem tem acesso ao BM digita banco, data e valor; produtividade e plantonistas são calculados
export default function DespesasBm(props: Props) {
  const { podeEditar, onCopiarMesAnterior, copiando } = props
  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div>
          <h2 className="font-semibold text-gray-800">Despesas</h2>
          <p className="text-xs text-gray-500">Descontadas do faturamento antes do rateio entre os sócios.</p>
        </div>
        {podeEditar && (
          <button
            type="button"
            onClick={onCopiarMesAnterior}
            disabled={copiando}
            className="text-sm font-semibold text-brand-700 hover:text-brand-900 border border-brand-200 hover:bg-brand-50 rounded-lg px-3 py-1.5 disabled:opacity-50"
          >
            {copiando ? "Copiando..." : "Copiar valores do mês anterior"}
          </button>
        )}
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        {EMPRESAS.map((e) => (
          <TabelaDespesas key={e.valor} empresa={e.valor} titulo={e.rotulo} {...props} />
        ))}
      </div>
    </section>
  )
}

function TabelaDespesas({
  empresa,
  titulo,
  despesas,
  resultado,
  podeEditar,
  onEditar,
  onAdicionar,
  onRenomear,
  onRemover,
}: Props & { empresa: Empresa; titulo: string }) {
  const linhas = despesas.filter((d) => d.empresa === empresa)
  const [novo, setNovo] = useState<string | null>(null)
  const [renomeando, setRenomeando] = useState<{ id: string; nome: string } | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function adicionar(e: React.FormEvent) {
    e.preventDefault()
    if (!novo?.trim()) return
    setSalvando(true)
    try {
      await onAdicionar(empresa, novo.trim())
      setNovo(null)
    } finally {
      setSalvando(false)
    }
  }

  async function renomear(despesa: Despesa) {
    if (!renomeando?.nome.trim() || renomeando.nome.trim() === despesa.nome) return setRenomeando(null)
    setSalvando(true)
    try {
      await onRenomear(despesa, renomeando.nome.trim())
      setRenomeando(null)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-200">
            <th className="px-3 py-2.5">{titulo}</th>
            <th className="px-3 py-2.5 w-32 text-right">Valor</th>
            <th className="px-2 py-2.5 w-28">Banco</th>
            <th className="px-2 py-2.5 w-36">Pago em</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((d) => (
            <tr key={d.id} className={`border-b border-gray-100 last:border-0 ${d.ativo ? "" : "opacity-60"}`}>
              <td className="px-3 py-1.5 min-w-[9rem] sm:min-w-[12rem]">
                {renomeando?.id === d.id ? (
                  <input
                    autoFocus
                    aria-label="Novo nome da despesa"
                    value={renomeando.nome}
                    maxLength={100}
                    disabled={salvando}
                    onChange={(e) => setRenomeando({ id: d.id, nome: e.target.value })}
                    onBlur={() => renomear(d)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") renomear(d)
                      if (e.key === "Escape") setRenomeando(null)
                    }}
                    className="w-full border border-gray-300 rounded px-1.5 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                ) : (
                  <div className="flex items-center gap-1.5 group">
                    <span className="text-gray-800">{d.nome}</span>
                    {!d.ativo && <span className="text-xs text-gray-400">(removida)</span>}
                    {podeEditar && d.ativo && (
                      <span className="flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => setRenomeando({ id: d.id, nome: d.nome })}
                          aria-label={`Renomear ${d.nome}`}
                          className="text-gray-400 hover:text-brand-700 p-0.5"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemover(d)}
                          aria-label={`Remover ${d.nome}`}
                          className="text-gray-400 hover:text-red-600 p-0.5"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </span>
                    )}
                  </div>
                )}
                {d.calculo && <p className="text-xs text-gray-400">Calculado: {ROTULO_CALCULO[d.calculo]}</p>}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums min-w-[7rem]">
                {d.calculo || !podeEditar ? (
                  <span className={d.calculo ? "text-gray-500" : "text-gray-800"}>
                    {d.calculo || d.valor != null ? formatarDinheiro(resultado.valorDespesa(d)) : ""}
                  </span>
                ) : (
                  <CampoNumero valor={d.valor} onChange={(valor) => onEditar(d.id, { valor })} ariaLabel={`Valor de ${d.nome}`} />
                )}
              </td>
              <td className="px-2 py-1.5">
                {podeEditar ? (
                  <input
                    type="text"
                    aria-label={`Banco de ${d.nome}`}
                    value={d.banco ?? ""}
                    maxLength={60}
                    onChange={(e) => onEditar(d.id, { banco: e.target.value || null })}
                    className="w-full min-w-[5rem] border border-gray-200 rounded px-1.5 py-1 text-sm bg-amber-50/40 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
                  />
                ) : (
                  <span className="text-gray-700">{d.banco}</span>
                )}
              </td>
              <td className="px-2 py-1.5">
                {podeEditar ? (
                  <input
                    type="date"
                    aria-label={`Data em que ${d.nome} foi paga`}
                    value={d.data_pago ?? ""}
                    onChange={(e) => onEditar(d.id, { data_pago: e.target.value || null })}
                    className="w-full border border-gray-200 rounded px-1.5 py-1 text-sm bg-amber-50/40 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
                  />
                ) : (
                  <span className="text-gray-700 tabular-nums">{formatarData(d.data_pago)}</span>
                )}
              </td>
            </tr>
          ))}

          {podeEditar && (
            <tr>
              <td colSpan={4} className="px-3 py-2">
                {novo === null ? (
                  <button type="button" onClick={() => setNovo("")} className="text-xs font-semibold text-brand-700 hover:text-brand-900">
                    + Adicionar despesa
                  </button>
                ) : (
                  <form onSubmit={adicionar} className="flex gap-2">
                    <input
                      autoFocus
                      aria-label="Nome da nova despesa"
                      placeholder="Nome da despesa"
                      value={novo}
                      maxLength={100}
                      onChange={(e) => setNovo(e.target.value)}
                      className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                    />
                    <button type="submit" disabled={salvando || !novo.trim()} className="text-xs font-semibold text-white bg-brand-700 hover:bg-brand-800 rounded px-3 disabled:opacity-50">
                      Adicionar
                    </button>
                    <button type="button" onClick={() => setNovo(null)} className="text-xs font-semibold text-gray-500 hover:text-gray-700 px-2">
                      Cancelar
                    </button>
                  </form>
                )}
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t border-gray-200 bg-gray-50 font-semibold text-gray-800">
            <td className="px-3 py-2.5">Total {empresa === "pmp" ? "PMP" : "GAMI"}</td>
            <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{formatarDinheiro(resultado.totalDespesas[empresa])}</td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
