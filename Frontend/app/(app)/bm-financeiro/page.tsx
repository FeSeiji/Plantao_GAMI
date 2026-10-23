"use client"

import React, { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import SiglaBadge from "../../../components/SiglaBadge"
import { apiFetch } from "../../../components/sessao"
import { formatarIntervalo, formatarPontos } from "../../../components/trocaPorHoras"
import { descreverPosicao } from "../../../components/posicoes"
import AjustePontosModal, { AjusteEditavel, TipoAjuste, rotuloTipoAjuste } from "../../../components/AjustePontosModal"
import ConfirmacaoModal, { Confirmacao } from "../../../components/ConfirmacaoModal"

// Administradores, técnicos e sócios — mesma lista do backend em routes/bmFinanceiro.js
const ROLES_BM_FINANCEIRO = ["admin", "tecnico", "anestesita_socio"]

// Fator de correção de cada sócio (linha FATOR CORREÇÃO da planilha). Por enquanto 1 para todos;
// na Etapa 2, com o financeiro, passa a ser editável
const FATOR_CORRECAO = 1

type Perfil = { id: string; nome: string | null; email: string | null; sigla: string | null }

// Uma coluna do BM. valor_escala: pontos de como o sócio foi escalado (a linha VALOR da planilha);
// pontos: o total, com as trocas e os ajustes
type Socio = Perfil & {
  plantoes: number
  valor_escala: number
  pontos_plantoes: number
  pontos_ajustes: number
  pontos: number
}

// Valor de cada sócio numa linha (id -> valor); quem não aparece fica em branco
type PorSocio = Record<string, number>

// Troca aceita: − para quem saiu e + para quem entrou (na cobertura de férias, só + para quem cobriu)
type Substituicao = {
  id: string
  data: string
  posicao: number
  tipo: "vaga" | "horas" | "ferias"
  hora_inicio: string | null
  hora_fim: string | null
  saida: Perfil
  entrada: Perfil
  pontos: PorSocio
}

// Caso fora com recibo GAMI/ADDS e a parte de cada sócio (dois anestesistas: metade cada)
type CasoForaRecibo = {
  id: string
  data: string
  escalado: boolean
  hospital: string | null
  cirurgia: string
  valor: number
  partes: PorSocio
}

// Categorias do plantonista — mesmas de Backend/src/services/pontuacao.js.
// Sexta à noite conta como noturno de fim de semana; a manhã de sábado e domingo, como diurno de fim de semana
const CATEGORIAS = [
  { chave: "diurno", rotulo: "Diurno" },
  { chave: "noturno", rotulo: "Noturno" },
  { chave: "diurno_fds", rotulo: "Diurno fim de semana" },
  { chave: "noturno_fds", rotulo: "Noturno fim de semana" },
] as const

type Categoria = (typeof CATEGORIAS)[number]["chave"]

type LinhaPlantonista = Perfil & {
  // Plantões em cada categoria (a fração na troca por horas e no congresso) e a soma deles
  categorias: Record<Categoria, number>
  total: number
}

// Ajuste manual de pontos de um sócio no mês (lançado por quem tem a flag admin)
type Ajuste = {
  id: string
  tipo: TipoAjuste
  pontos: number
  motivo: string
  medico: Perfil
  criado_por: Perfil
  criado_em: string
  atualizado_por: Perfil | null
  atualizado_em: string | null
}

// Uma criação, edição ou exclusão de ajuste; na edição, anterior traz o tipo, os pontos e o motivo de antes
type EventoHistorico = {
  id: string
  ajuste_id: string
  acao: "criado" | "editado" | "excluido"
  tipo: TipoAjuste
  pontos: number
  motivo: string
  medico: Perfil
  feito_por: Perfil
  feito_em: string
  anterior: { tipo: TipoAjuste; pontos: number; motivo: string } | null
}

type Bm = {
  mes: string
  socios: Socio[]
  substituicoes: Substituicao[]
  casosForaRecibo: CasoForaRecibo[]
  plantonistas: LinhaPlantonista[]
  ajustes: Ajuste[]
  historico: EventoHistorico[]
}

// Linhas da grade, de cima para baixo, como na planilha do cliente
type LinhaGrade =
  | { tipo: "secao"; titulo: string; subtitulo?: string }
  | { tipo: "siglas" }
  | { tipo: "vazia"; texto: string }
  | {
      tipo: "valores"
      chave: string
      rotulo: string
      detalhe?: string
      valores: PorSocio
      formato: "pontos" | "dinheiro" | "fator"
      // subtotal e total: linhas calculadas, que mostram 0 e ficam em destaque
      destaque?: "subtotal" | "total"
    }

function paraChaveMes(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

// As "fórmulas" da planilha: somas por coluna e porcentagens
function somar(linhas: PorSocio[], socios: Socio[]): PorSocio {
  return Object.fromEntries(socios.map((s) => [s.id, arredondar(linhas.reduce((t, l) => t + (l[s.id] ?? 0), 0))]))
}

function multiplicar(linha: PorSocio, fator: number): PorSocio {
  return Object.fromEntries(Object.entries(linha).map(([id, v]) => [id, arredondar(v * fator)]))
}

const arredondar = (n: number) => Math.round(n * 100) / 100

const formatarDiaMes = (data: string) => `${data.slice(8, 10)}/${data.slice(5, 7)}`

// Bloco de casos fora (escalado ou não): um caso por linha, o total e a divisão entre médico e custas
function linhasCasosFora(
  casos: CasoForaRecibo[],
  socios: Socio[],
  { titulo, subtitulo, medico, custas, chave }: { titulo: string; subtitulo: string; medico: number; custas: number; chave: string },
): { linhas: LinhaGrade[]; custas: PorSocio } {
  const total = somar(casos.map((c) => c.partes), socios)
  const parteCustas = multiplicar(total, custas)
  const pct = (n: number) => `${Math.round(n * 100)}%`
  return {
    custas: parteCustas,
    linhas: [
      { tipo: "secao", titulo, subtitulo },
      ...(casos.length === 0
        ? [{ tipo: "vazia", texto: "Nenhum caso neste mês." } as LinhaGrade]
        : casos.map(
            (c): LinhaGrade => ({
              tipo: "valores",
              chave: `caso-${c.id}`,
              rotulo: `${formatarDiaMes(c.data)} · ${c.hospital ?? c.cirurgia}`,
              detalhe: c.hospital ? c.cirurgia : undefined,
              valores: c.partes,
              formato: "dinheiro",
            }),
          )),
      { tipo: "valores", chave: `${chave}-total`, rotulo: "Total 100%", valores: total, formato: "dinheiro", destaque: "subtotal" },
      { tipo: "valores", chave: `${chave}-medico`, rotulo: `Médico ${pct(medico)}`, valores: multiplicar(total, medico), formato: "dinheiro", destaque: "subtotal" },
      { tipo: "valores", chave: `${chave}-custas`, rotulo: `Custas ${pct(custas)}`, valores: parteCustas, formato: "dinheiro", destaque: "subtotal" },
    ],
  }
}

function rotuloSubstituicao(s: Substituicao) {
  const quem = `${s.saida.sigla ?? s.saida.nome ?? "?"} → ${s.entrada.sigla ?? s.entrada.nome ?? "?"}`
  return `${formatarDiaMes(s.data)} · ${quem}`
}

function detalheSubstituicao(s: Substituicao) {
  const vaga = descreverPosicao(s.data, s.posicao)
  if (s.tipo === "ferias") return `${vaga} · cobertura de férias`
  if (s.tipo === "horas" && s.hora_inicio && s.hora_fim) return `${vaga} · ${formatarIntervalo(s.hora_inicio, s.hora_fim)}`
  return vaga
}

// A planilha inteira em linhas: casos fora com recibo, a prévia dos sócios e o bloco de pontos
function montarGrade(bm: Bm): LinhaGrade[] {
  const { socios } = bm
  const escalado = linhasCasosFora(
    bm.casosForaRecibo.filter((c) => c.escalado),
    socios,
    { titulo: "Casos fora com recibo — escalado", subtitulo: "Valor integral; custas de 50%", medico: 0.5, custas: 0.5, chave: "escalado" },
  )
  const naoEscalado = linhasCasosFora(
    bm.casosForaRecibo.filter((c) => !c.escalado),
    socios,
    { titulo: "Casos fora com recibo — não escalado", subtitulo: "Valor integral; custas de 20%", medico: 0.8, custas: 0.2, chave: "nao-escalado" },
  )

  const porSocio = (valor: (s: Socio) => number): PorSocio => Object.fromEntries(socios.map((s) => [s.id, valor(s)]))
  const somaDoTipo = (tipo: TipoAjuste) =>
    somar(bm.ajustes.filter((a) => a.tipo === tipo).map((a) => ({ [a.medico.id]: a.pontos })), socios)

  const valor = porSocio((s) => s.valor_escala)
  const corrigido = multiplicar(valor, FATOR_CORRECAO)
  const outros = bm.ajustes.filter((a) => a.tipo === "outro")
  const administrativo = somaDoTipo("administrativo")
  const reuniao = somaDoTipo("reuniao")
  const totSubstituido = multiplicar(
    somar([...bm.substituicoes.map((s) => s.pontos), administrativo, reuniao, ...outros.map((a) => ({ [a.medico.id]: a.pontos }))], socios),
    FATOR_CORRECAO,
  )
  const total = somar([corrigido, totSubstituido], socios)

  return [
    { tipo: "siglas" },
    ...escalado.linhas,
    ...naoEscalado.linhas,
    {
      tipo: "valores",
      chave: "previa",
      rotulo: "D. Prévia sócios",
      detalhe: "Custas dos casos fora",
      valores: somar([escalado.custas, naoEscalado.custas], socios),
      formato: "dinheiro",
      destaque: "total",
    },
    { tipo: "secao", titulo: "Pontos" },
    { tipo: "siglas" },
    { tipo: "valores", chave: "valor", rotulo: "Valor", detalhe: "Pontos da escala", valores: valor, formato: "pontos", destaque: "subtotal" },
    { tipo: "valores", chave: "fator", rotulo: "Fator de correção", valores: porSocio(() => FATOR_CORRECAO), formato: "fator" },
    { tipo: "valores", chave: "corrigido", rotulo: "Valor corrigido", valores: corrigido, formato: "pontos", destaque: "subtotal" },
    ...bm.substituicoes.map(
      (s): LinhaGrade => ({
        tipo: "valores",
        chave: `troca-${s.id}`,
        rotulo: `Substituído ${rotuloSubstituicao(s)}`,
        detalhe: detalheSubstituicao(s),
        valores: s.pontos,
        formato: "pontos",
      }),
    ),
    { tipo: "valores", chave: "administrativo", rotulo: "Administrativo", valores: administrativo, formato: "pontos" },
    { tipo: "valores", chave: "reuniao", rotulo: "Reunião", valores: reuniao, formato: "pontos" },
    ...outros.map(
      (a): LinhaGrade => ({
        tipo: "valores",
        chave: `ajuste-${a.id}`,
        rotulo: `Ajuste: ${a.motivo}`,
        valores: { [a.medico.id]: a.pontos },
        formato: "pontos",
      }),
    ),
    { tipo: "valores", chave: "tot-substituido", rotulo: "Tot. substituído", valores: totSubstituido, formato: "pontos", destaque: "subtotal" },
    { tipo: "valores", chave: "total", rotulo: "TOTAL", valores: total, formato: "pontos", destaque: "total" },
  ]
}

function formatarNumero(valor: number, formato: "pontos" | "dinheiro" | "fator") {
  if (formato === "dinheiro") return valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (formato === "fator") return valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })
  return formatarPontos(valor)
}

// A grade no formato da planilha: os sócios em colunas, pela sigla, e uma coluna de total no fim.
// A primeira coluna fica fixa ao rolar para o lado
function GradeBm({ bm, loading }: { bm: Bm; loading: boolean }) {
  const { socios } = bm
  const linhas = montarGrade(bm)
  const colunas = socios.length + 2
  const fixa = "sticky left-0 z-10"

  return (
    <div className={`bg-white rounded-xl border border-gray-200 overflow-x-auto ${loading ? "opacity-60" : ""} transition-opacity`}>
      <table className="text-sm border-collapse min-w-full">
        <tbody>
          {linhas.map((linha, i) => {
            if (linha.tipo === "secao") {
              return (
                <tr key={`secao-${i}`} className="border-t-2 border-gray-200">
                  <td colSpan={colunas} className="px-0 pt-4 pb-1">
                    <div className={`${fixa} inline-block px-4 bg-white`}>
                      <p className="text-xs font-bold text-brand-800 uppercase tracking-wide">{linha.titulo}</p>
                      {linha.subtitulo && <p className="text-xs text-gray-400">{linha.subtitulo}</p>}
                    </div>
                  </td>
                </tr>
              )
            }
            if (linha.tipo === "siglas") {
              return (
                <tr key={`siglas-${i}`} className="border-b border-gray-200 bg-gray-50">
                  <th className={`${fixa} bg-gray-50 px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase min-w-[9rem] sm:min-w-[14rem]`}>
                    {i === 0 ? "Sócio" : ""}
                  </th>
                  {socios.map((s) => (
                    <th key={s.id} className="px-2 py-2 min-w-[4.5rem]" title={s.nome ?? s.email ?? ""}>
                      <div className="flex justify-end">
                        <SiglaBadge sigla={s.sigla} size="sm" />
                      </div>
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Total</th>
                </tr>
              )
            }
            if (linha.tipo === "vazia") {
              return (
                <tr key={`vazia-${i}`}>
                  <td className={`${fixa} bg-white px-4 py-1.5 text-xs text-gray-400`}>{linha.texto}</td>
                  <td colSpan={colunas - 1} />
                </tr>
              )
            }

            const calculada = Boolean(linha.destaque)
            const fundo = linha.destaque === "total" ? "bg-brand-50" : "bg-white"
            const peso = linha.destaque ? "font-semibold" : ""
            const totalLinha = arredondar(socios.reduce((t, s) => t + (linha.valores[s.id] ?? 0), 0))
            const celula = (valor: number | undefined) => {
              if (valor === undefined || (valor === 0 && !calculada)) return ""
              return formatarNumero(valor, linha.formato)
            }
            // Zero das linhas calculadas apagado, negativo em vermelho
            const cor = (valor: number | undefined) =>
              valor === 0 ? "text-gray-300" : valor !== undefined && valor < 0 ? "text-red-600" : linha.destaque ? "text-gray-800" : "text-gray-700"

            return (
              <tr key={linha.chave} className={`border-b border-gray-100 ${fundo}`}>
                <td className={`${fixa} ${fundo} px-3 sm:px-4 py-1.5 max-w-[9rem] sm:max-w-[16rem]`}>
                  <p className={`truncate ${peso} ${linha.destaque ? "text-gray-800" : "text-gray-700"}`} title={linha.rotulo}>
                    {linha.rotulo}
                  </p>
                  {linha.detalhe && (
                    <p className="text-xs text-gray-400 truncate" title={linha.detalhe}>
                      {linha.detalhe}
                    </p>
                  )}
                </td>
                {socios.map((s) => (
                  <td key={s.id} className={`px-2 py-1.5 text-right tabular-nums whitespace-nowrap ${peso} ${cor(linha.valores[s.id])}`}>
                    {celula(linha.valores[s.id])}
                  </td>
                ))}
                <td className={`px-3 py-1.5 text-right tabular-nums whitespace-nowrap font-semibold ${cor(totalLinha)}`}>
                  {linha.formato === "fator" ? "" : celula(totalLinha)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

const MESES_ABREVIADOS =["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]

function SeletorMes({ valor, onChange }: { valor: Date; onChange: (mes: Date) => void }) {
  const [aberto, setAberto] = useState(false)
  const [anoExibido, setAnoExibido] = useState(valor.getFullYear())
  const hoje = new Date()

  function abrir() {
    setAnoExibido(valor.getFullYear())
    setAberto(true)
  }

  function escolher(mesIndex: number) {
    onChange(new Date(anoExibido, mesIndex, 1))
    setAberto(false)
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => (aberto ? setAberto(false) : abrir())}
        className="flex items-center justify-center gap-1.5 font-semibold text-gray-800 capitalize min-w-40 px-2 py-1 rounded-md hover:bg-gray-100"
      >
        {valor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {aberto && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setAberto(false)} />
          <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 z-20 w-64 bg-white rounded-xl border border-gray-200 shadow-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <button
                type="button"
                onClick={() => setAnoExibido((a) => a - 1)}
                aria-label="Ano anterior"
                className="p-1 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <span className="font-semibold text-gray-800 text-sm">{anoExibido}</span>
              <button
                type="button"
                onClick={() => setAnoExibido((a) => a + 1)}
                aria-label="Próximo ano"
                className="p-1 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>

            <div className="grid grid-cols-4 gap-1">
              {MESES_ABREVIADOS.map((rotulo, i) => {
                const selecionado = anoExibido === valor.getFullYear() && i === valor.getMonth()
                const atual = anoExibido === hoje.getFullYear() && i === hoje.getMonth()
                return (
                  <button
                    key={rotulo}
                    type="button"
                    onClick={() => escolher(i)}
                    className={`text-xs font-semibold capitalize py-2 rounded-md transition-colors ${
                      selecionado
                        ? "bg-brand-700 text-white"
                        : atual
                        ? "text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50"
                        : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    {rotulo}
                  </button>
                )
              })}
            </div>

            <button
              type="button"
              onClick={() => {
                onChange(new Date(hoje.getFullYear(), hoje.getMonth(), 1))
                setAberto(false)
              }}
              className="w-full mt-2 text-xs font-semibold text-brand-700 hover:text-brand-900 py-1.5"
            >
              Mês atual
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default function BmFinanceiroPage() {
  const router = useRouter()
  const [mesReferencia, setMesReferencia] = useState(() => {
    const hoje = new Date()
    return new Date(hoje.getFullYear(), hoje.getMonth(), 1)
  })
  const [bm, setBm] = useState<Bm | null>(null)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  const [autorizado, setAutorizado] = useState(false)
  const [exportando, setExportando] = useState(false)
  // Só quem tem a flag admin dá e tira pontos (o backend confere de novo)
  const [podeAjustar, setPodeAjustar] = useState(false)
  // undefined: fechado; null: novo ajuste; um ajuste: editando ele
  const [ajusteEmEdicao, setAjusteEmEdicao] = useState<AjusteEditavel | null | undefined>(undefined)
  const [confirmacao, setConfirmacao] = useState<Confirmacao | null>(null)
  // Muda depois de lançar, editar ou excluir um ajuste, para buscar o BM de novo
  const [versao, setVersao] = useState(0)

  useEffect(() => {
    if (!localStorage.getItem("token")) {
      router.push("/login")
      return
    }
    const roles = lerRoles()
    if (!roles.some((r) => ROLES_BM_FINANCEIRO.includes(r))) {
      router.push("/dashboard")
      return
    }
    setAutorizado(true)
    setPodeAjustar(roles.includes("admin"))
  }, [router])

  const mes = paraChaveMes(mesReferencia)

  useEffect(() => {
    const token = localStorage.getItem("token")
    if (!autorizado || !token) return

    setLoading(true)
    apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/bm-financeiro?mes=${mes}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? "Não foi possível carregar o BM Financeiro.")
        setBm(data)
        setError("")
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [autorizado, mes, versao])

  function mudarMes(delta: number) {
    setMesReferencia((atual) => new Date(atual.getFullYear(), atual.getMonth() + delta, 1))
  }

  const recarregar = () => setVersao((v) => v + 1)

  // O backend preenche o modelo de Excel do cliente com os dados do mês ("BM OUT 26.xlsx")
  async function exportar() {
    setExportando(true)
    try {
      const res = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/bm-financeiro/exportar?mes=${mes}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? "Não foi possível gerar o arquivo Excel.")
      }
      const url = URL.createObjectURL(await res.blob())
      const link = document.createElement("a")
      link.href = url
      link.download = `BM ${MESES_ABREVIADOS[mesReferencia.getMonth()].toUpperCase()} ${String(mesReferencia.getFullYear()).slice(2)}.xlsx`
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível gerar o arquivo Excel.")
    } finally {
      setExportando(false)
    }
  }

  function pedirExclusao(ajuste: Ajuste) {
    setConfirmacao({
      titulo: "Excluir ajuste",
      mensagem: (
        <>
          Excluir <strong>{formatarAjuste(ajuste.pontos)} pts</strong> de {nomeDoPerfil(ajuste.medico)} ({ajuste.motivo})? A
          exclusão continua aparecendo no histórico.
        </>
      ),
      rotuloConfirmar: "Excluir",
      perigo: true,
      acao: async () => {
        const res = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/bm-financeiro/ajustes/${ajuste.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          setError(data.error ?? "Não foi possível excluir o ajuste.")
          return
        }
        recarregar()
      },
    })
  }

  const rotuloMes = mesReferencia.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })

  return (
    <main className="max-w-[96rem] mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold text-gray-800">BM Financeiro</h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => mudarMes(-1)}
              aria-label="Mês anterior"
              className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <SeletorMes valor={mesReferencia} onChange={setMesReferencia} />
            <button
              type="button"
              onClick={() => mudarMes(1)}
              aria-label="Próximo mês"
              className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={exportar}
          disabled={!bm || loading || exportando}
          className="flex items-center gap-2 bg-brand-700 hover:bg-brand-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          {exportando ? "Exportando..." : "Exportar Excel"}
        </button>
      </div>

      {error && (
        <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-6">{error}</p>
      )}

      {bm && (
        <div className="space-y-6">
          {bm.socios.length === 0 ? (
            <p className="bg-white rounded-xl border border-gray-200 px-4 py-8 text-center text-sm text-gray-400">
              Nenhum sócio cadastrado.
            </p>
          ) : (
            <GradeBm bm={bm} loading={loading} />
          )}
          <SecaoAjustes
            ajustes={bm.ajustes}
            historico={bm.historico}
            loading={loading}
            podeAjustar={podeAjustar}
            onNovo={() => setAjusteEmEdicao(null)}
            onEditar={(a) => setAjusteEmEdicao(a)}
            onExcluir={pedirExclusao}
          />
          <section>
            <h2 className="font-semibold text-gray-800 mb-1">Plantonistas</h2>
            <p className="text-xs text-gray-500 mb-3">Plantões do mês por categoria. Não fazem parte da planilha dos sócios.</p>
            <TabelaPlantonistasPorCategoria linhas={bm.plantonistas} loading={loading} />
          </section>
        </div>
      )}

      {ajusteEmEdicao !== undefined && (
        <AjustePontosModal
          mes={mes}
          rotuloMes={rotuloMes}
          ajuste={ajusteEmEdicao ?? undefined}
          onClose={() => setAjusteEmEdicao(undefined)}
          onSaved={recarregar}
        />
      )}
      {confirmacao && <ConfirmacaoModal confirmacao={confirmacao} onClose={() => setConfirmacao(null)} />}
    </main>
  )
}

function lerRoles(): string[] {
  try {
    return JSON.parse(localStorage.getItem("roles") ?? "[]")
  } catch {
    return []
  }
}

function formatarDataHora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function nomeDoPerfil(perfil: Perfil) {
  return perfil.nome ?? perfil.email ?? "—"
}

// "+5" ou "−3,5", com o sinal de menos tipográfico
function formatarAjuste(pontos: number) {
  return `${pontos > 0 ? "+" : "−"}${formatarPontos(Math.abs(pontos))}`
}

function ValorAjuste({ pontos, className = "" }: { pontos: number; className?: string }) {
  if (pontos === 0) return <span className={`text-gray-400 ${className}`}>—</span>
  return (
    <span className={`tabular-nums whitespace-nowrap ${pontos > 0 ? "text-green-700" : "text-red-600"} ${className}`}>
      {formatarAjuste(pontos)}
    </span>
  )
}

// Frase do histórico: quem fez o quê, e na edição o que mudou
function DescricaoEvento({ evento }: { evento: EventoHistorico }) {
  const quem = <strong className="font-semibold text-gray-800">{nomeDoPerfil(evento.feito_por)}</strong>
  const medico = <strong className="font-semibold text-gray-800">{nomeDoPerfil(evento.medico)}</strong>
  const tipo = rotuloTipoAjuste(evento.tipo)

  if (evento.acao === "criado") {
    return (
      <>
        {quem} lançou <ValorAjuste pontos={evento.pontos} className="font-semibold" /> pts ({tipo}) para {medico}: {evento.motivo}
      </>
    )
  }
  if (evento.acao === "excluido") {
    return (
      <>
        {quem} excluiu <ValorAjuste pontos={evento.pontos} className="font-semibold line-through" /> pts ({tipo}) de {medico} ({evento.motivo})
      </>
    )
  }
  const { anterior } = evento
  if (!anterior) {
    return (
      <>
        {quem} editou o ajuste de {medico}: <ValorAjuste pontos={evento.pontos} className="font-semibold" /> pts ({tipo}), {evento.motivo}
      </>
    )
  }
  const mudancas: React.ReactNode[] = []
  if (anterior.pontos !== evento.pontos) {
    mudancas.push(
      <span key="pontos">
        <ValorAjuste pontos={anterior.pontos} /> → <ValorAjuste pontos={evento.pontos} className="font-semibold" /> pts
      </span>,
    )
  }
  if (anterior.tipo !== evento.tipo) {
    mudancas.push(<span key="tipo">tipo {rotuloTipoAjuste(anterior.tipo)} → {tipo}</span>)
  }
  if (anterior.motivo !== evento.motivo) {
    mudancas.push(
      <span key="motivo">
        motivo &ldquo;{anterior.motivo}&rdquo; → &ldquo;{evento.motivo}&rdquo;
      </span>,
    )
  }
  return (
    <>
      {quem} editou o ajuste de {medico}:{" "}
      {mudancas.map((m, i) => (
        <React.Fragment key={i}>
          {i > 0 && "; "}
          {m}
        </React.Fragment>
      ))}
    </>
  )
}

// Ajustes manuais do mês e o histórico deles: todos que veem o BM veem tudo; só o admin lança, edita e exclui
function SecaoAjustes({
  ajustes,
  historico,
  loading,
  podeAjustar,
  onNovo,
  onEditar,
  onExcluir,
}: {
  ajustes: Ajuste[]
  historico: EventoHistorico[]
  loading: boolean
  podeAjustar: boolean
  onNovo: () => void
  onEditar: (ajuste: Ajuste) => void
  onExcluir: (ajuste: Ajuste) => void
}) {
  return (
    <section className={`bg-white rounded-xl border border-gray-200 ${loading ? "opacity-60" : ""} transition-opacity`}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-4 border-b border-gray-200">
        <div>
          <h2 className="font-semibold text-gray-800">Ajustes de pontos</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Pontos dados ou tirados à mão, com o motivo. Entram nas linhas Administrativo, Reunião ou como ajuste avulso.
          </p>
        </div>
        {podeAjustar && (
          <button
            type="button"
            onClick={onNovo}
            className="bg-brand-700 hover:bg-brand-800 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            Dar ou tirar pontos
          </button>
        )}
      </div>

      <ul>
        {ajustes.map((a) => (
          <li key={a.id} className="flex items-start gap-3 px-4 py-3 border-b border-gray-100 last:border-0">
            <SiglaBadge sigla={a.medico.sigla} />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-gray-800 truncate">
                {nomeDoPerfil(a.medico)}
                <span className="ml-2 text-xs font-semibold text-brand-700 bg-brand-50 rounded px-1.5 py-0.5">
                  {rotuloTipoAjuste(a.tipo)}
                </span>
              </p>
              <p className="text-sm text-gray-700 break-words">{a.motivo}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Lançado por {nomeDoPerfil(a.criado_por)} em {formatarDataHora(a.criado_em)}
                {a.atualizado_por && a.atualizado_em && (
                  <> · editado por {nomeDoPerfil(a.atualizado_por)} em {formatarDataHora(a.atualizado_em)}</>
                )}
              </p>
              {podeAjustar && (
                <div className="flex gap-3 mt-1">
                  <button type="button" onClick={() => onEditar(a)} className="text-xs font-semibold text-brand-700 hover:text-brand-900">
                    Editar
                  </button>
                  <button type="button" onClick={() => onExcluir(a)} className="text-xs font-semibold text-red-600 hover:text-red-800">
                    Excluir
                  </button>
                </div>
              )}
            </div>
            <ValorAjuste pontos={a.pontos} className="font-semibold" />
          </li>
        ))}

        {!loading && ajustes.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-gray-400">Nenhum ajuste neste mês.</li>
        )}
      </ul>

      {historico.length > 0 && (
        <details className="border-t border-gray-200">
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50">
            Histórico de alterações ({historico.length})
          </summary>
          <ol className="px-4 pb-4 space-y-2">
            {historico.map((h) => (
              <li key={h.id} className="text-sm text-gray-600">
                <span className="text-xs text-gray-400 tabular-nums mr-2">{formatarDataHora(h.feito_em)}</span>
                <DescricaoEvento evento={h} />
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  )
}

// Plantonistas: quantos plantões em cada categoria (com fração na troca por horas e no congresso)
function TabelaPlantonistasPorCategoria({
  linhas,
  loading,
}: {
  linhas: LinhaPlantonista[]
  loading: boolean
}) {
  const somar = (valor: (l: LinhaPlantonista) => number) => linhas.reduce((s, l) => s + valor(l), 0)

  return (
    <div className={`bg-white rounded-xl border border-gray-200 overflow-x-auto ${loading ? "opacity-60" : ""} transition-opacity`}>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-200">
            <th className="px-4 py-3">Médico</th>
            {CATEGORIAS.map((c) => (
              <th key={c.chave} className="px-3 py-3 text-right">
                {c.rotulo}
              </th>
            ))}
            <th className="px-4 py-3 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.id} className="border-b border-gray-100 last:border-0">
              <td className="px-4 py-3 min-w-[12rem]">
                <div className="flex items-center gap-3">
                  <SiglaBadge sigla={l.sigla} />
                  <div className="min-w-0">
                    <p className="font-medium text-gray-800 truncate">{l.nome ?? "—"}</p>
                    <p className="text-gray-400 text-xs truncate">{l.email}</p>
                  </div>
                </div>
              </td>
              {CATEGORIAS.map((c) => (
                <td key={c.chave} className="px-3 py-3 text-right text-gray-700 tabular-nums">
                  {formatarPontos(l.categorias[c.chave])}
                </td>
              ))}
              <td className="px-4 py-3 text-right font-semibold text-gray-800 tabular-nums">{formatarPontos(l.total)}</td>
            </tr>
          ))}

          {!loading && linhas.length === 0 && (
            <tr>
              <td colSpan={CATEGORIAS.length + 2} className="px-4 py-8 text-center text-gray-400">
                Nenhum plantonista com plantão neste mês.
              </td>
            </tr>
          )}
        </tbody>
        {linhas.length > 0 && (
          <tfoot>
            <tr className="border-t border-gray-200 bg-gray-50 text-gray-800 font-semibold">
              <td className="px-4 py-3">Total</td>
              {CATEGORIAS.map((c) => (
                <td key={c.chave} className="px-3 py-3 text-right tabular-nums">
                  {formatarPontos(somar((l) => l.categorias[c.chave]))}
                </td>
              ))}
              <td className="px-4 py-3 text-right tabular-nums">{formatarPontos(somar((l) => l.total))}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}
