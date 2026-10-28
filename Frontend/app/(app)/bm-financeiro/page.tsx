"use client"

import React, { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import SiglaBadge from "../../../components/SiglaBadge"
import { apiFetch } from "../../../components/sessao"
import { formatarIntervalo, formatarPontos } from "../../../components/trocaPorHoras"
import { descreverPosicao } from "../../../components/posicoes"
import AjustePontosModal, { AjusteEditavel, TipoAjuste, rotuloTipoAjuste } from "../../../components/AjustePontosModal"
import ConfirmacaoModal, { Confirmacao } from "../../../components/ConfirmacaoModal"
import CampoNumero from "../../../components/bm/CampoNumero"
import DespesasBm from "../../../components/bm/DespesasBm"
import { Recibo, rotuloRecibo } from "../../../components/casosFora"
import HistoricoFinanceiro, { EventoFinanceiro } from "../../../components/bm/HistoricoFinanceiro"
import {
  CATEGORIAS_PLANTAO,
  CampoMes,
  CampoSocioDinheiro,
  Despesa,
  Edicoes,
  Empresa,
  FATOR_DISTRIBUICAO,
  Financeiro,
  ResultadoFinanceiro,
  SocioFinanceiro,
  aplicarEdicoes,
  calcularFinanceiro,
  edicoesVazias,
  formatarDinheiro,
  pagamentoPlantonista,
  socioVazio,
  temEdicoes,
  valoresPlantao,
} from "../../../components/bm/calculos"

// Administradores, técnicos, sócios e quem tem acesso ao BM — mesma lista do backend em routes/bmFinanceiro.js
const ROLES_BM_FINANCEIRO = ["admin", "tecnico", "anestesita_socio", "bm_access"]

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

// Caso fora com valor (com ou sem recibo) e a parte de cada sócio (dois anestesistas: metade cada)
type CasoForaBm = {
  id: string
  data: string
  escalado: boolean
  recibo: Recibo | null
  hospital: string | null
  cirurgia: string
  valor: number
  partes: PorSocio
}

type LinhaPlantonista = Perfil & {
  // Plantões em cada categoria (a fração na troca por horas e no congresso) e a soma deles
  categorias: Record<(typeof CATEGORIAS_PLANTAO)[number]["chave"], number>
  total: number
}

// Sócio Jr: sem pontos; os plantões do mês agrupados pelo dia da semana, pelo turno e pelo nome da vaga naquele
// dia. plantoes e fracao: quanto do plantão ele fez (a fração na troca por horas e no congresso)
type SocioJr = Perfil & {
  total: number
  grupos: {
    dia_semana: string
    turno: "diurno" | "noturno"
    vaga: string
    plantoes: number
    datas: { data: string; fracao: number }[]
  }[]
}

// Ajuste manual de pontos de um sócio no mês (lançado por quem tem acesso ao BM)
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
  casosForaBm: CasoForaBm[]
  plantonistas: LinhaPlantonista[]
  sociosJr: SocioJr[]
  ajustes: Ajuste[]
  historico: EventoHistorico[]
  financeiro: Financeiro & { historico: EventoFinanceiro[] }
}

type Formato = "pontos" | "dinheiro" | "fator" | "valorPonto"

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
      formato: Formato
      // subtotal e total: linhas calculadas, que mostram 0 e ficam em destaque
      destaque?: "subtotal" | "total"
      // Linha digitada por quem tem acesso ao BM: cada célula vira um campo
      editar?: (socioId: string, valor: number | null) => void
      // Linha de um valor só (pontos distribuídos, valor do ponto): aparece na coluna de total
      unico?: number
    }

function paraChaveMes(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

// As "fórmulas" da planilha: somas por coluna e porcentagens
function somar(linhas: PorSocio[], socios: Socio[]): PorSocio {
  return Object.fromEntries(socios.map((s) => [s.id, arredondar(linhas.reduce((t, l) => t + (l[s.id] ?? 0), 0))]))
}

function multiplicar(linha: PorSocio, fator: number | ((id: string) => number)): PorSocio {
  const f = typeof fator === "number" ? () => fator : fator
  return Object.fromEntries(Object.entries(linha).map(([id, v]) => [id, arredondar(v * f(id))]))
}

const arredondar = (n: number) => Math.round(n * 100) / 100
const somarTudo = (linha: PorSocio) => arredondar(Object.values(linha).reduce((t, v) => t + v, 0))

const formatarDiaMes = (data: string) => `${data.slice(8, 10)}/${data.slice(5, 7)}`

// Caso fora sem recibo GAMI/ADDS: entra nas mesmas contas, com o aviso no rótulo
const avisoRecibo = (recibo: Recibo | null) => (recibo === "gami" ? null : rotuloRecibo(recibo) || "Sem recibo ainda")

// Bloco de casos fora (escalado ou não): um caso por linha, o total e a divisão entre médico e custas
function linhasCasosFora(
  casos: CasoForaBm[],
  socios: Socio[],
  { titulo, subtitulo, medico, custas, chave }: { titulo: string; subtitulo: string; medico: number; custas: number; chave: string },
): { linhas: LinhaGrade[]; total: PorSocio; medico: PorSocio; custas: PorSocio } {
  const total = somar(casos.map((c) => c.partes), socios)
  const parteMedico = multiplicar(total, medico)
  const parteCustas = multiplicar(total, custas)
  const pct = (n: number) => `${Math.round(n * 100)}%`
  return {
    total,
    medico: parteMedico,
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
              detalhe: [c.hospital ? c.cirurgia : null, avisoRecibo(c.recibo)].filter(Boolean).join(" · ") || undefined,
              valores: c.partes,
              formato: "dinheiro",
            }),
          )),
      { tipo: "valores", chave: `${chave}-total`, rotulo: "Total 100%", valores: total, formato: "dinheiro", destaque: "subtotal" },
      { tipo: "valores", chave: `${chave}-medico`, rotulo: `Médico ${pct(medico)}`, valores: parteMedico, formato: "dinheiro", destaque: "subtotal" },
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

// Primeira parte da planilha: GAMI PRO sem recibo (linha 2), casos fora e a prévia dos sócios.
// Devolve também os totais que entram no faturamento, 100% dos casos fora (R122) e as custas (R124), e o que vai
// para a conta corrente: a prévia (distribuição CF) e a parte do médico nos casos fora (CF)
function montarCasosFora(bm: Bm, fin: Financeiro, editarSocio?: (id: string, campos: Partial<SocioFinanceiro>) => void) {
  const { socios } = bm
  const escalado = linhasCasosFora(
    bm.casosForaBm.filter((c) => c.escalado),
    socios,
    { titulo: "Casos fora — escalado", subtitulo: "Valor integral; custas de 50%", medico: 0.5, custas: 0.5, chave: "escalado" },
  )
  const naoEscalado = linhasCasosFora(
    bm.casosForaBm.filter((c) => !c.escalado),
    socios,
    { titulo: "Casos fora — não escalado", subtitulo: "Valor integral; custas de 20%", medico: 0.8, custas: 0.2, chave: "nao-escalado" },
  )
  const gamiPro: PorSocio = Object.fromEntries(
    socios.filter((s) => fin.socios[s.id]?.gami_pro_sem_recibo != null).map((s) => [s.id, fin.socios[s.id].gami_pro_sem_recibo!]),
  )
  const custas = somar([escalado.custas, naoEscalado.custas], socios)
  const previa = somar([gamiPro, custas], socios)

  const linhas: LinhaGrade[] = [
    { tipo: "siglas" },
    {
      tipo: "valores",
      chave: "gami-pro",
      rotulo: "GAMI PRO sem recibo",
      valores: gamiPro,
      formato: "dinheiro",
      editar: editarSocio && ((id, valor) => editarSocio(id, { gami_pro_sem_recibo: valor })),
    },
    ...escalado.linhas,
    ...naoEscalado.linhas,
    {
      tipo: "valores",
      chave: "previa",
      rotulo: "D. Prévia sócios",
      detalhe: "GAMI PRO sem recibo + custas dos casos fora",
      valores: previa,
      formato: "dinheiro",
      destaque: "total",
    },
  ]
  return {
    linhas,
    casosFora100: arredondar(somarTudo(escalado.total) + somarTudo(naoEscalado.total)),
    custasCasosFora: somarTudo(custas),
    previa,
    medico: somar([escalado.medico, naoEscalado.medico], socios),
  }
}

// Bloco de pontos (linhas 132 a 174): valor da escala × fator, substituições, ajustes, TOTAL,
// e com o financeiro o valor do ponto e a previsão de cada sócio
function montarPontos(
  bm: Bm,
  fin: Financeiro,
  valorParaDistribuir: number,
  editarSocio?: (id: string, campos: Partial<SocioFinanceiro>) => void,
): { linhas: LinhaGrade[]; previsao: PorSocio } {
  const { socios } = bm
  const fator = (id: string) => fin.socios[id]?.fator_correcao ?? 1
  const porSocio = (valor: (s: Socio) => number): PorSocio => Object.fromEntries(socios.map((s) => [s.id, valor(s)]))
  const somaDoTipo = (tipo: TipoAjuste) =>
    somar(bm.ajustes.filter((a) => a.tipo === tipo).map((a) => ({ [a.medico.id]: a.pontos })), socios)

  const valor = porSocio((s) => s.valor_escala)
  const corrigido = multiplicar(valor, fator)
  const outros = bm.ajustes.filter((a) => a.tipo === "outro")
  const administrativo = somaDoTipo("administrativo")
  const reuniao = somaDoTipo("reuniao")
  const totSubstituido = multiplicar(
    somar([...bm.substituicoes.map((s) => s.pontos), administrativo, reuniao, ...outros.map((a) => ({ [a.medico.id]: a.pontos }))], socios),
    fator,
  )
  const total = somar([corrigido, totSubstituido], socios)
  const pontosDistribuidos = somarTudo(total)
  const valorDoPonto = pontosDistribuidos > 0 ? valorParaDistribuir / pontosDistribuidos : 0
  const previsao = multiplicar(total, valorDoPonto)

  const linhas: LinhaGrade[] = [
    { tipo: "secao", titulo: "Pontos" },
    { tipo: "siglas" },
    { tipo: "valores", chave: "valor", rotulo: "Valor", detalhe: "Pontos da escala", valores: valor, formato: "pontos", destaque: "subtotal" },
    {
      tipo: "valores",
      chave: "fator",
      rotulo: "Fator de correção",
      valores: porSocio((s) => fator(s.id)),
      formato: "fator",
      editar: editarSocio && ((id, v) => v != null && v > 0 && editarSocio(id, { fator_correcao: v })),
    },
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
    { tipo: "valores", chave: "distribuidos", rotulo: "Pontos distribuídos", valores: {}, formato: "pontos", unico: pontosDistribuidos },
    {
      tipo: "valores",
      chave: "valor-ponto",
      rotulo: "Valor do ponto",
      detalhe: "Valor para distribuir ÷ pontos distribuídos",
      valores: {},
      formato: "valorPonto",
      unico: valorDoPonto,
    },
    {
      tipo: "valores",
      chave: "previsao",
      rotulo: "Previsão",
      detalhe: "TOTAL × valor do ponto",
      valores: previsao,
      formato: "dinheiro",
      destaque: "total",
    },
  ]
  return { linhas, previsao }
}

const CAMPOS_BANCOS: { campo: CampoSocioDinheiro; rotulo: string }[] = [
  { campo: "bradesco_dia_05", rotulo: "Bradesco dia 05" },
  { campo: "itau_dia_05", rotulo: "Itaú dia 05" },
  { campo: "bradesco_dia_10", rotulo: "Bradesco dia 10" },
  { campo: "itau_dia_10", rotulo: "Itaú dia 10" },
  { campo: "cef", rotulo: "CEF" },
]

// Conta corrente (linhas 175 a 197 da planilha): a previsão mais a diferença que veio do mês anterior e o DARF,
// menos o que foi distribuído; a diferença final passa para o mês seguinte. Começa no mês conta_corrente.desde,
// em que a dif. mês anterior é o saldo inicial digitado; nos seguintes ela vem do backend, refeita em cascata.
// Antes do primeiro mês não aparece (null)
function montarContaCorrente(
  bm: Bm,
  fin: Financeiro,
  { previsao, previa, medico }: { previsao: PorSocio; previa: PorSocio; medico: PorSocio },
  editarSocio?: (id: string, campos: Partial<SocioFinanceiro>) => void,
): LinhaGrade[] | null {
  const { desde, dif_mes_anterior } = fin.conta_corrente
  if (bm.mes < desde) return null
  const { socios } = bm
  const primeiroMes = bm.mes === desde
  const campo = (c: CampoSocioDinheiro): PorSocio =>
    Object.fromEntries(socios.filter((s) => fin.socios[s.id]?.[c] != null).map((s) => [s.id, fin.socios[s.id][c]!]))
  const digitada = (chave: CampoSocioDinheiro, rotulo: string, detalhe?: string): LinhaGrade => ({
    tipo: "valores",
    chave,
    rotulo,
    detalhe,
    valores: campo(chave),
    formato: "dinheiro",
    editar: editarSocio && ((id, valor) => editarSocio(id, { [chave]: valor } as Partial<SocioFinanceiro>)),
  })

  const difAnterior = primeiroMes ? campo("saldo_inicial") : dif_mes_anterior ?? {}
  const prevAtualizada = somar([previsao, difAnterior, campo("darf")], socios)
  const distrTotal = somar([previa, campo("pro_labore"), campo("distr_dia_05"), campo("distr_dia_10")], socios)
  const diferencaFinal = Object.fromEntries(socios.map((s) => [s.id, arredondar(prevAtualizada[s.id] - distrTotal[s.id])]))
  const totalADistribuir = somar([campo("distr_dia_05"), campo("distr_dia_10")], socios)
  const bancos = somar(CAMPOS_BANCOS.map((b) => campo(b.campo)), socios)
  const balanco = Object.fromEntries(socios.map((s) => [s.id, arredondar(totalADistribuir[s.id] - bancos[s.id])]))

  return [
    {
      tipo: "secao",
      titulo: "Conta corrente",
      subtitulo: primeiroMes
        ? "Primeiro mês no sistema: a dif. mês anterior é o saldo que veio da planilha"
        : "A diferença final passa para o mês seguinte",
    },
    { tipo: "siglas" },
    primeiroMes
      ? digitada("saldo_inicial", "Dif. mês anterior", "Saldo inicial, da planilha")
      : { tipo: "valores", chave: "dif-anterior", rotulo: "Dif. mês anterior", detalhe: "Diferença final do mês anterior", valores: difAnterior, formato: "dinheiro" },
    digitada("darf", "DARF"),
    { tipo: "valores", chave: "prev-atualizada", rotulo: "Prev. atualizada", detalhe: "Previsão + dif. mês anterior + DARF", valores: prevAtualizada, formato: "dinheiro", destaque: "subtotal" },
    { tipo: "valores", chave: "distribuicao-cf", rotulo: "Distribuição CF", detalhe: "D. Prévia sócios", valores: previa, formato: "dinheiro" },
    digitada("pro_labore", "Pró-labore"),
    digitada("distr_dia_05", "Distr. dia 05"),
    digitada("distr_dia_10", "Distr. dia 10"),
    { tipo: "valores", chave: "distr-total", rotulo: "Distr. total", valores: distrTotal, formato: "dinheiro", destaque: "subtotal" },
    { tipo: "valores", chave: "diferenca-final", rotulo: "Diferença final", detalhe: "Prev. atualizada − distr. total", valores: diferencaFinal, formato: "dinheiro", destaque: "total" },
    { tipo: "valores", chave: "cf", rotulo: "CF", detalhe: "Parte do médico nos casos fora", valores: medico, formato: "dinheiro" },
    { tipo: "valores", chave: "pro-e-cf", rotulo: "Pró e CF", detalhe: "Distr. total + CF", valores: somar([distrTotal, medico], socios), formato: "dinheiro", destaque: "subtotal" },
    { tipo: "secao", titulo: "Bancos da distribuição", subtitulo: "Onde saiu a distribuição dos dias 05 e 10" },
    { tipo: "siglas" },
    { tipo: "valores", chave: "total-a-distribuir", rotulo: "Total a distribuir", detalhe: "Distr. dia 05 + dia 10", valores: totalADistribuir, formato: "dinheiro", destaque: "subtotal" },
    ...CAMPOS_BANCOS.map((b) => digitada(b.campo, b.rotulo)),
    { tipo: "valores", chave: "balanco", rotulo: "Balanço", detalhe: "Total a distribuir − bancos (deve dar zero)", valores: balanco, formato: "dinheiro", destaque: "total" },
  ]
}

function formatarNumero(valor: number, formato: Formato) {
  if (formato === "dinheiro") return formatarDinheiro(valor)
  if (formato === "valorPonto") return valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })
  if (formato === "fator") return valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })
  return formatarPontos(valor)
}

// A grade no formato da planilha: os sócios em colunas, pela sigla, e uma coluna de total no fim.
// A primeira coluna fica fixa ao rolar para o lado
function GradeBm({ socios, linhas, loading }: { socios: Socio[]; linhas: LinhaGrade[]; loading: boolean }) {
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
            const fundo = linha.destaque === "total" ? "bg-brand-50" : linha.editar ? "bg-amber-50/30" : "bg-white"
            const peso = linha.destaque || linha.unico !== undefined ? "font-semibold" : ""
            const totalLinha = linha.unico ?? arredondar(socios.reduce((t, s) => t + (linha.valores[s.id] ?? 0), 0))
            const celula = (valor: number | undefined) => {
              if (valor === undefined || (valor === 0 && !calculada && linha.unico === undefined)) return ""
              return formatarNumero(valor, linha.formato)
            }
            // Zero das linhas calculadas apagado, negativo em vermelho
            const cor = (valor: number | undefined) =>
              valor === 0 ? "text-gray-300" : valor !== undefined && valor < 0 ? "text-red-600" : linha.destaque ? "text-gray-800" : "text-gray-700"

            return (
              <tr key={linha.chave} className={`border-b border-gray-100 ${fundo}`}>
                <td className={`${fixa} ${fundo === "bg-amber-50/30" ? "bg-white" : fundo} px-3 sm:px-4 py-1.5 max-w-[9rem] sm:max-w-[16rem]`}>
                  <p className={`truncate ${peso} ${linha.destaque ? "text-gray-800" : "text-gray-700"}`} title={linha.rotulo}>
                    {linha.rotulo}
                  </p>
                  {linha.detalhe && (
                    <p className="text-xs text-gray-400 truncate" title={linha.detalhe}>
                      {linha.detalhe}
                    </p>
                  )}
                </td>
                {socios.map((s) =>
                  linha.editar ? (
                    <td key={s.id} className="px-1 py-1 min-w-[6.5rem]">
                      <CampoNumero
                        valor={linha.valores[s.id] ?? null}
                        onChange={(v) => linha.editar!(s.id, v)}
                        casas={linha.formato === "fator" ? 4 : 2}
                        ariaLabel={`${linha.rotulo} de ${s.sigla ?? s.nome ?? ""}`}
                      />
                    </td>
                  ) : (
                    <td key={s.id} className={`px-2 py-1.5 text-right tabular-nums whitespace-nowrap ${peso} ${cor(linha.valores[s.id])}`}>
                      {linha.unico === undefined ? celula(linha.valores[s.id]) : ""}
                    </td>
                  ),
                )}
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

// Faturamento do mês (T2, U2 e V2 da planilha) e o que vem dos sócios e dos casos fora
function CardFaturamento({
  fin,
  resultado,
  editar,
}: {
  fin: Financeiro
  resultado: ResultadoFinanceiro
  editar?: (campo: CampoMes, valor: number | null) => void
}) {
  const campos: { campo: CampoMes; rotulo: string; detalhe: string }[] = [
    { campo: "faturamento_pmp", rotulo: "Faturamento PMP", detalhe: "Entra no rateio" },
    { campo: "gami_total", rotulo: "GAMI total (na PRO)", detalhe: "Entra no rateio" },
    { campo: "recibos_gami", rotulo: "Recibos GAMI emitidos", detalhe: "Healthchess; base dos impostos da GAMI" },
  ]
  return (
    <section className="bg-white rounded-xl border border-gray-200 p-4">
      <h2 className="font-semibold text-gray-800 mb-3">Faturamento do mês</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        {campos.map((c) => (
          <div key={c.campo}>
            <p className="text-sm font-medium text-gray-700">{c.rotulo}</p>
            {editar ? (
              <div className="mt-1 max-w-[12rem]">
                <CampoNumero valor={fin[c.campo]} onChange={(v) => editar(c.campo, v)} ariaLabel={c.rotulo} placeholder="0,00" />
              </div>
            ) : (
              <p className="mt-1 text-lg font-semibold text-gray-800 tabular-nums">{fin[c.campo] == null ? "—" : formatarDinheiro(fin[c.campo])}</p>
            )}
            <p className="text-xs text-gray-400 mt-0.5">{c.detalhe}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-500 mt-3">
        GAMI PRO sem recibo (soma dos sócios): <strong className="tabular-nums">{formatarDinheiro(resultado.gamiProSemRecibo)}</strong> · Casos fora
        (100%): <strong className="tabular-nums">{formatarDinheiro(resultado.casosFora100)}</strong>
      </p>
    </section>
  )
}

// Rateio (N122 a R128 da planilha): faturamento geral − despesas, × 0,63 = valor para distribuir
function CardRateio({ fin, resultado }: { fin: Financeiro; resultado: ResultadoFinanceiro }) {
  const pct = (v: number) =>
    resultado.faturamentoGeral > 0 ? `${((v / resultado.faturamentoGeral) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : ""
  const linhas: { rotulo: string; valor: number; pct?: string; destaque?: boolean; sinal?: string }[] = [
    { rotulo: "Faturamento GAMI na PRO", valor: fin.gami_total ?? 0, pct: pct(fin.gami_total ?? 0) },
    { rotulo: "Casos fora (custas distribuídas)", valor: resultado.custasCasosFora, pct: pct(resultado.custasCasosFora) },
    { rotulo: "Faturamento PMP", valor: fin.faturamento_pmp ?? 0, pct: pct(fin.faturamento_pmp ?? 0) },
    { rotulo: "Faturamento geral", valor: resultado.faturamentoGeral, destaque: true },
    { rotulo: "Despesas PMP", valor: resultado.totalDespesas.pmp, sinal: "−" },
    { rotulo: "Despesas GAMI", valor: resultado.totalDespesas.gami, sinal: "−" },
  ]
  return (
    <section className="bg-white rounded-xl border border-gray-200 p-4">
      <h2 className="font-semibold text-gray-800 mb-3">Rateio</h2>
      <table className="w-full text-sm">
        <tbody>
          {linhas.map((l) => (
            <tr key={l.rotulo} className={l.destaque ? "border-t border-gray-200 font-semibold text-gray-800" : "text-gray-700"}>
              <td className="py-1">
                {l.sinal && <span className="text-gray-400 mr-1">{l.sinal}</span>}
                {l.rotulo}
              </td>
              <td className="py-1 text-right text-xs text-gray-400 w-16">{l.pct}</td>
              <td className="py-1 text-right tabular-nums w-36">{formatarDinheiro(l.valor)}</td>
            </tr>
          ))}
          <tr className="text-gray-700">
            <td className="py-1">
              <span className="text-gray-400 mr-1">×</span>Fator de distribuição
            </td>
            <td />
            <td className="py-1 text-right tabular-nums">{FATOR_DISTRIBUICAO.toLocaleString("pt-BR")}</td>
          </tr>
          <tr className="border-t border-gray-200 font-semibold text-gray-900 bg-brand-50">
            <td className="py-2 pl-2">Valor para distribuir</td>
            <td />
            <td className={`py-2 pr-2 text-right tabular-nums ${resultado.valorParaDistribuir < 0 ? "text-red-600" : ""}`}>
              {formatarDinheiro(resultado.valorParaDistribuir)}
            </td>
          </tr>
        </tbody>
      </table>
    </section>
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
  // Só quem tem a flag bm_access edita o financeiro e os ajustes (o backend confere de novo)
  const [podeEditar, setPodeEditar] = useState(false)
  // undefined: fechado; null: novo ajuste; um ajuste: editando ele
  const [ajusteEmEdicao, setAjusteEmEdicao] = useState<AjusteEditavel | null | undefined>(undefined)
  const [confirmacao, setConfirmacao] = useState<Confirmacao | null>(null)
  // Muda depois de salvar ou de mexer em ajustes e na lista de despesas, para buscar o BM de novo
  const [versao, setVersao] = useState(0)
  // O que foi digitado e ainda não foi salvo (no formato do PUT); a tela já mostra as contas com isso
  const [edicoes, setEdicoes] = useState<Edicoes>(edicoesVazias)
  const [salvando, setSalvando] = useState(false)
  const [copiando, setCopiando] = useState(false)

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
    setPodeEditar(roles.includes("bm_access"))
  }, [router])

  const mes = paraChaveMes(mesReferencia)
  const alterado = temEdicoes(edicoes)

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

  // Sair da página com alterações não salvas: o navegador pergunta antes
  useEffect(() => {
    if (!alterado) return
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", avisar)
    return () => window.removeEventListener("beforeunload", avisar)
  }, [alterado])

  const recarregar = () => setVersao((v) => v + 1)

  function irParaMes(novo: Date) {
    const trocar = () => {
      setEdicoes(edicoesVazias())
      setMesReferencia(novo)
    }
    if (!alterado) return trocar()
    setConfirmacao({
      titulo: "Descartar alterações?",
      mensagem: "As alterações deste mês ainda não foram salvas e serão perdidas.",
      rotuloConfirmar: "Descartar e trocar de mês",
      perigo: true,
      acao: async () => trocar(),
    })
  }

  function mudarMes(delta: number) {
    irParaMes(new Date(mesReferencia.getFullYear(), mesReferencia.getMonth() + delta, 1))
  }

  // Edições: o valor igual ao gravado sai da lista, para "Salvar" só aparecer quando algo mudou de verdade
  function editarMes(campo: CampoMes, valor: number | null) {
    setEdicoes((e) => {
      const mesEditado = { ...e.mes, [campo]: valor }
      if (bm && bm.financeiro[campo] === valor) delete mesEditado[campo]
      return { ...e, mes: mesEditado }
    })
  }

  function editarSocio(id: string, campos: Partial<SocioFinanceiro>) {
    setEdicoes((e) => {
      const gravado: SocioFinanceiro = { ...socioVazio(), ...bm?.financeiro.socios[id] }
      const socio: Partial<SocioFinanceiro> = { ...e.socios[id], ...campos }
      for (const campo of Object.keys(socio) as (keyof SocioFinanceiro)[]) if (socio[campo] === gravado[campo]) delete socio[campo]
      const socios = { ...e.socios, [id]: socio }
      if (Object.keys(socio).length === 0) delete socios[id]
      return { ...e, socios }
    })
  }

  function editarDespesa(id: string, campos: Partial<Pick<Despesa, "banco" | "data_pago" | "valor">>) {
    setEdicoes((e) => {
      const gravada = bm?.financeiro.despesas.find((d) => d.id === id)
      const despesa = { ...e.despesas[id], ...campos }
      for (const campo of Object.keys(despesa) as (keyof typeof despesa)[]) if (gravada && despesa[campo] === gravada[campo]) delete despesa[campo]
      const despesas = { ...e.despesas, [id]: despesa }
      if (Object.keys(despesa).length === 0) delete despesas[id]
      return { ...e, despesas }
    })
  }

  async function salvar() {
    setSalvando(true)
    try {
      const res = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/bm-financeiro/financeiro?mes=${mes}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}`, "Content-Type": "application/json" },
        body: JSON.stringify(edicoes),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? "Não foi possível salvar.")
      }
      setEdicoes(edicoesVazias())
      setError("")
      recarregar()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar.")
    } finally {
      setSalvando(false)
    }
  }

  // Traz o valor (e o banco) de cada despesa do mês anterior para as que estão vazias neste mês. Fica como
  // edição: só grava ao salvar
  async function copiarMesAnterior() {
    if (!bm) return
    setCopiando(true)
    try {
      const anterior = paraChaveMes(new Date(mesReferencia.getFullYear(), mesReferencia.getMonth() - 1, 1))
      const res = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/bm-financeiro?mes=${anterior}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Não foi possível buscar o mês anterior.")
      const atuais = aplicarEdicoes(bm.financeiro, edicoes).despesas
      let copiadas = 0
      for (const d of (data as Bm).financeiro.despesas) {
        const atual = atuais.find((a) => a.id === d.id)
        if (!atual || atual.calculo || atual.valor != null || d.valor == null) continue
        editarDespesa(d.id, { valor: d.valor, ...(atual.banco ? {} : { banco: d.banco }) })
        copiadas++
      }
      setError(copiadas === 0 ? "O mês anterior não tem valores para copiar nas despesas vazias." : "")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível buscar o mês anterior.")
    } finally {
      setCopiando(false)
    }
  }

  // Lista de despesas (incluir, renomear, remover): grava na hora e recarrega, sem perder o que foi digitado
  async function chamarItens(caminho: string, metodo: "POST" | "PATCH", body: object) {
    const res = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/bm-financeiro/despesa-itens${caminho}`, {
      method: metodo,
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? "Não foi possível alterar a lista de despesas.")
      return
    }
    recarregar()
  }

  function pedirRemocaoDespesa(despesa: Despesa) {
    setConfirmacao({
      titulo: "Remover despesa",
      mensagem: (
        <>
          Remover <strong>{despesa.nome}</strong> da lista? Ela some dos meses sem valor nela; os meses que já têm valor continuam
          mostrando.
        </>
      ),
      rotuloConfirmar: "Remover",
      perigo: true,
      acao: () => chamarItens(`/${despesa.id}`, "PATCH", { ativo: false }),
    })
  }

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

  // As contas da planilha, refeitas a cada valor digitado
  const fin = bm ? aplicarEdicoes(bm.financeiro, edicoes) : null
  const casosFora = bm && fin ? montarCasosFora(bm, fin, podeEditar ? editarSocio : undefined) : null
  const resultado =
    bm && fin && casosFora
      ? calcularFinanceiro(fin, {
          casosFora100: casosFora.casosFora100,
          custasCasosFora: casosFora.custasCasosFora,
          plantonistas: bm.plantonistas,
        })
      : null
  const pontos = bm && fin && resultado ? montarPontos(bm, fin, resultado.valorParaDistribuir, podeEditar ? editarSocio : undefined) : null
  const contaCorrente =
    bm && fin && casosFora && pontos
      ? montarContaCorrente(bm, fin, { previsao: pontos.previsao, previa: casosFora.previa, medico: casosFora.medico }, podeEditar ? editarSocio : undefined)
      : null

  return (
    <main className={`max-w-[96rem] mx-auto px-4 sm:px-6 py-8 sm:py-12 ${alterado ? "pb-28" : ""}`}>
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
            <SeletorMes valor={mesReferencia} onChange={irParaMes} />
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
          disabled={!bm || loading || exportando || alterado}
          title={alterado ? "Salve as alterações antes de exportar" : undefined}
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

      {bm && fin && casosFora && resultado && pontos && (
        <div className="space-y-6">
          <CardFaturamento fin={fin} resultado={resultado} editar={podeEditar ? editarMes : undefined} />
          {bm.socios.length === 0 ? (
            <p className="bg-white rounded-xl border border-gray-200 px-4 py-8 text-center text-sm text-gray-400">
              Nenhum sócio cadastrado.
            </p>
          ) : (
            <GradeBm socios={bm.socios} linhas={casosFora.linhas} loading={loading} />
          )}
          <DespesasBm
            despesas={fin.despesas}
            resultado={resultado}
            podeEditar={podeEditar}
            onEditar={editarDespesa}
            onAdicionar={(empresa: Empresa, nome: string) => chamarItens("", "POST", { empresa, nome })}
            onRenomear={(despesa, nome) => chamarItens(`/${despesa.id}`, "PATCH", { nome })}
            onRemover={pedirRemocaoDespesa}
            onCopiarMesAnterior={copiarMesAnterior}
            copiando={copiando}
          />
          <CardRateio fin={fin} resultado={resultado} />
          {bm.socios.length > 0 && (
            <GradeBm socios={bm.socios} linhas={[...pontos.linhas, ...(contaCorrente ?? [])]} loading={loading} />
          )}
          <SecaoAjustes
            ajustes={bm.ajustes}
            historico={bm.historico}
            loading={loading}
            podeAjustar={podeEditar}
            onNovo={() => setAjusteEmEdicao(null)}
            onEditar={(a) => setAjusteEmEdicao(a)}
            onExcluir={pedirExclusao}
          />
          <SecaoSociosJr linhas={bm.sociosJr} loading={loading} />
          <SecaoPlantonistas
            linhas={bm.plantonistas}
            fin={fin}
            resultado={resultado}
            loading={loading}
            editar={podeEditar ? editarMes : undefined}
          />
          <HistoricoFinanceiro eventos={bm.financeiro.historico} />
        </div>
      )}

      {alterado && podeEditar && (
        <div className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-200 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
          <div className="max-w-[96rem] mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gray-700">
              <strong>Alterações não salvas</strong> em {rotuloMes}. As contas acima já mostram os valores novos.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEdicoes(edicoesVazias())}
                disabled={salvando}
                className="border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 font-semibold px-4 py-2 rounded-lg text-sm disabled:opacity-60"
              >
                Descartar
              </button>
              <button
                type="button"
                onClick={salvar}
                disabled={salvando}
                className="bg-brand-700 hover:bg-brand-800 text-white font-semibold px-5 py-2 rounded-lg text-sm disabled:opacity-60"
              >
                {salvando ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
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

// Ajustes manuais do mês e o histórico deles: todos que veem o BM veem tudo; só quem tem acesso ao BM lança, edita e exclui
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

// Sócios Jr: só os plantões, pela vaga e pelo dia da semana (sem pontos e fora da despesa dos plantonistas)
function SecaoSociosJr({ linhas, loading }: { linhas: SocioJr[]; loading: boolean }) {
  const formatarDatas = (datas: SocioJr["grupos"][number]["datas"]) =>
    datas.map((d) => (d.fracao === 1 ? formatarDiaMes(d.data) : `${formatarDiaMes(d.data)} (${formatarPontos(d.fracao)})`)).join(", ")

  return (
    <section>
      <h2 className="font-semibold text-gray-800 mb-1">Sócios Jr</h2>
      <p className="text-xs text-gray-500 mb-3">
        Plantões do mês pela vaga e pelo dia da semana. Sócio Jr não tem pontos e não entra na despesa &ldquo;Plantonistas&rdquo;.
      </p>
      <div className={`bg-white rounded-xl border border-gray-200 overflow-x-auto ${loading ? "opacity-60" : ""} transition-opacity`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-200">
              <th className="px-4 py-3">Dia</th>
              <th className="px-3 py-3">Turno</th>
              <th className="px-3 py-3">Vaga</th>
              <th className="px-3 py-3 text-right">Plantões</th>
              <th className="px-4 py-3">Datas</th>
            </tr>
          </thead>
          {linhas.map((s) => (
            <tbody key={s.id} className="border-b border-gray-200 last:border-0">
              <tr className="bg-gray-50">
                <td colSpan={3} className="px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <SiglaBadge sigla={s.sigla} />
                    <div className="min-w-0">
                      <p className="font-medium text-gray-800 truncate">{s.nome ?? "—"}</p>
                      <p className="text-gray-400 text-xs truncate">{s.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right font-semibold text-gray-800 tabular-nums">{formatarPontos(s.total)}</td>
                <td className="px-4 py-2.5 text-xs text-gray-500">no mês</td>
              </tr>
              {s.grupos.map((g) => (
                <tr key={`${g.dia_semana}-${g.turno}-${g.vaga}`} className="border-t border-gray-100">
                  <td className="px-4 py-2 text-gray-700">{g.dia_semana}</td>
                  <td className="px-3 py-2 text-gray-700">{g.turno === "diurno" ? "Diurno" : "Noturno"}</td>
                  <td className="px-3 py-2 text-gray-800 font-medium">{g.vaga}</td>
                  <td className="px-3 py-2 text-right text-gray-700 tabular-nums">{formatarPontos(g.plantoes)}</td>
                  <td className="px-4 py-2 text-gray-500 tabular-nums">{formatarDatas(g.datas)}</td>
                </tr>
              ))}
            </tbody>
          ))}
          {!loading && linhas.length === 0 && (
            <tbody>
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  Nenhum sócio Jr com plantão neste mês.
                </td>
              </tr>
            </tbody>
          )}
        </table>
      </div>
    </section>
  )
}

// Plantonistas: plantões em cada categoria (com fração na troca por horas e no congresso), o valor de cada
// categoria no mês e quanto cada um recebe. A soma é a despesa "Plantonistas" da PMP
function SecaoPlantonistas({
  linhas,
  fin,
  resultado,
  loading,
  editar,
}: {
  linhas: LinhaPlantonista[]
  fin: Financeiro
  resultado: ResultadoFinanceiro
  loading: boolean
  editar?: (campo: CampoMes, valor: number | null) => void
}) {
  const valores = valoresPlantao(fin)
  const somar = (valor: (l: LinhaPlantonista) => number) => linhas.reduce((s, l) => s + valor(l), 0)

  return (
    <section>
      <h2 className="font-semibold text-gray-800 mb-1">Plantonistas</h2>
      <p className="text-xs text-gray-500 mb-3">
        Plantões do mês por categoria e o valor pago por plantão. O total entra na despesa &ldquo;Plantonistas&rdquo; da PMP.
      </p>
      <div className={`bg-white rounded-xl border border-gray-200 overflow-x-auto ${loading ? "opacity-60" : ""} transition-opacity`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-200">
              <th className="px-4 py-3">Médico</th>
              {CATEGORIAS_PLANTAO.map((c) => (
                <th key={c.chave} className="px-3 py-3 text-right">
                  {c.rotulo}
                </th>
              ))}
              <th className="px-3 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-right">A receber</th>
            </tr>
            <tr className="border-b border-gray-200 bg-amber-50/30">
              <td className="px-4 py-2 text-xs font-semibold text-gray-600">Valor do plantão (R$)</td>
              {CATEGORIAS_PLANTAO.map((c) => {
                const herdado = fin[c.campo] == null && fin.valores_plantao_anteriores[c.campo] != null
                return (
                  <td key={c.chave} className="px-2 py-1.5 text-right min-w-[7rem]">
                    {editar ? (
                      <CampoNumero
                        valor={fin[c.campo]}
                        onChange={(v) => editar(c.campo, v)}
                        ariaLabel={`Valor do plantão ${c.rotulo.toLowerCase()}`}
                        placeholder={herdado ? formatarDinheiro(fin.valores_plantao_anteriores[c.campo]) : "0,00"}
                      />
                    ) : (
                      <span className="tabular-nums text-gray-700">{valores[c.chave] == null ? "—" : formatarDinheiro(valores[c.chave])}</span>
                    )}
                    {herdado && <p className="text-[11px] text-gray-400 mt-0.5">do mês anterior</p>}
                  </td>
                )
              })}
              <td colSpan={2} />
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
                {CATEGORIAS_PLANTAO.map((c) => (
                  <td key={c.chave} className="px-3 py-3 text-right text-gray-700 tabular-nums">
                    {formatarPontos(l.categorias[c.chave])}
                  </td>
                ))}
                <td className="px-3 py-3 text-right font-semibold text-gray-800 tabular-nums">{formatarPontos(l.total)}</td>
                <td className="px-4 py-3 text-right font-semibold text-gray-800 tabular-nums whitespace-nowrap">
                  {formatarDinheiro(pagamentoPlantonista(l, valores))}
                </td>
              </tr>
            ))}

            {!loading && linhas.length === 0 && (
              <tr>
                <td colSpan={CATEGORIAS_PLANTAO.length + 3} className="px-4 py-8 text-center text-gray-400">
                  Nenhum plantonista com plantão neste mês.
                </td>
              </tr>
            )}
          </tbody>
          {linhas.length > 0 && (
            <tfoot>
              <tr className="border-t border-gray-200 bg-gray-50 text-gray-800 font-semibold">
                <td className="px-4 py-3">Total</td>
                {CATEGORIAS_PLANTAO.map((c) => (
                  <td key={c.chave} className="px-3 py-3 text-right tabular-nums">
                    {formatarPontos(somar((l) => l.categorias[c.chave]))}
                  </td>
                ))}
                <td className="px-3 py-3 text-right tabular-nums">{formatarPontos(somar((l) => l.total))}</td>
                <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">{formatarDinheiro(resultado.totalPlantonistas)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  )
}
