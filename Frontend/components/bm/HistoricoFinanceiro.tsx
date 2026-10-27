"use client"

import React from "react"
import { formatarDinheiro } from "./calculos"

type Perfil = { id: string; nome: string | null; email: string | null; sigla: string | null }

// Uma mudança no financeiro (Backend/src/services/financeiroBm.js, descreverEvento): só os campos que mudaram
export type EventoFinanceiro = {
  id: string
  tabela: "bm_meses" | "bm_socios_mes" | "bm_despesas" | "bm_despesa_itens"
  feito_por: Perfil | null
  feito_em: string
  criado: boolean
  socio: Perfil | null
  item: { id: string | null; nome: string | null; empresa: "pmp" | "gami" | null } | null
  mudancas: { campo: string; antes: unknown; depois: unknown }[]
}

const ROTULO_CAMPO: Record<string, string> = {
  faturamento_pmp: "Faturamento PMP",
  recibos_gami: "Recibos GAMI (Healthchess)",
  gami_total: "GAMI total",
  valor_diurno: "Valor do plantão diurno",
  valor_noturno: "Valor do plantão noturno",
  valor_diurno_fds: "Valor do plantão diurno de fim de semana",
  valor_noturno_fds: "Valor do plantão noturno de fim de semana",
  gami_pro_sem_recibo: "GAMI PRO sem recibo",
  saldo_inicial: "saldo inicial",
  darf: "DARF",
  pro_labore: "pró-labore",
  distr_dia_05: "distribuição do dia 05",
  distr_dia_10: "distribuição do dia 10",
  bradesco_dia_05: "Bradesco dia 05",
  itau_dia_05: "Itaú dia 05",
  bradesco_dia_10: "Bradesco dia 10",
  itau_dia_10: "Itaú dia 10",
  cef: "CEF",
  fator_correcao: "fator de correção",
  banco: "banco",
  data_pago: "data paga",
  valor: "valor",
}

function formatarValor(campo: string, valor: unknown) {
  if (valor === null || valor === undefined || valor === "") return "vazio"
  if (campo === "data_pago") {
    const t = String(valor)
    return `${t.slice(8, 10)}/${t.slice(5, 7)}/${t.slice(0, 4)}`
  }
  if (campo === "fator_correcao") return Number(valor).toLocaleString("pt-BR", { maximumFractionDigits: 4 })
  if (typeof valor === "number") return formatarDinheiro(valor)
  return String(valor)
}

function formatarDataHora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

const nome = (p: Perfil | null) => p?.nome ?? p?.email ?? "Alguém"
const empresa = (e: string | null) => (e === "gami" ? "GAMI" : "PMP")

function Mudancas({ evento }: { evento: EventoFinanceiro }) {
  return (
    <>
      {evento.mudancas.map((m, i) => (
        <React.Fragment key={m.campo}>
          {i > 0 && "; "}
          {ROTULO_CAMPO[m.campo] ?? m.campo}: {formatarValor(m.campo, m.antes)} →{" "}
          <strong className="font-semibold text-gray-800">{formatarValor(m.campo, m.depois)}</strong>
        </React.Fragment>
      ))}
    </>
  )
}

function Descricao({ evento }: { evento: EventoFinanceiro }) {
  const quem = <strong className="font-semibold text-gray-800">{nome(evento.feito_por)}</strong>
  if (evento.tabela === "bm_despesa_itens") {
    const item = `${evento.item?.nome ?? "uma despesa"} (${empresa(evento.item?.empresa ?? null)})`
    if (evento.criado) return <>{quem} incluiu a despesa {item}</>
    const ativo = evento.mudancas.find((m) => m.campo === "ativo")
    if (ativo) return <>{quem} {ativo.depois ? "voltou a incluir" : "removeu"} a despesa {item}</>
    const renome = evento.mudancas.find((m) => m.campo === "nome")
    if (renome) return <>{quem} renomeou a despesa &ldquo;{String(renome.antes)}&rdquo; para &ldquo;{String(renome.depois)}&rdquo;</>
    return <>{quem} alterou a despesa {item}</>
  }
  if (evento.tabela === "bm_despesas") {
    return (
      <>
        {quem} alterou {evento.item?.nome ?? "uma despesa"} ({empresa(evento.item?.empresa ?? null)}): <Mudancas evento={evento} />
      </>
    )
  }
  if (evento.tabela === "bm_socios_mes") {
    return (
      <>
        {quem} alterou {evento.socio?.sigla ?? nome(evento.socio)}: <Mudancas evento={evento} />
      </>
    )
  }
  return (
    <>
      {quem} alterou <Mudancas evento={evento} />
    </>
  )
}

// Histórico do financeiro do mês (e das mudanças na lista de despesas), do mais recente para o mais antigo
export default function HistoricoFinanceiro({ eventos }: { eventos: EventoFinanceiro[] }) {
  if (eventos.length === 0) return null
  return (
    <details className="bg-white rounded-xl border border-gray-200">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 rounded-xl">
        Histórico do financeiro ({eventos.length})
      </summary>
      <ol className="px-4 pb-4 space-y-2">
        {eventos.map((e) => (
          <li key={e.id} className="text-sm text-gray-600">
            <span className="text-xs text-gray-400 tabular-nums mr-2">{formatarDataHora(e.feito_em)}</span>
            <Descricao evento={e} />
          </li>
        ))}
      </ol>
    </details>
  )
}
