"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import SiglaBadge from "../../../components/SiglaBadge"
import { apiFetch } from "../../../components/sessao"
import { formatarPontos } from "../../../components/trocaPorHoras"
import { CasoFora, anestesistasDe, formatarCpf, formatarValor, rotuloRecibo } from "../../../components/casosFora"

// Administradores e técnicos — mesma lista do backend em routes/bmFinanceiro.js
const ROLES_BM_FINANCEIRO = ["admin", "tecnico"]

type Aba = "plantonista" | "socio" | "casos_fora"

type LinhaBase = {
  id: string
  nome: string | null
  email: string | null
  sigla: string | null
  plantoes: number
}

type Resumo = {
  mes: string
  plantonistas: (LinhaBase & { minutos: number })[]
  socios: (LinhaBase & { pontos: number })[]
  casosFora: CasoFora[]
}

function lerRoles(): string[] {
  try {
    return JSON.parse(localStorage.getItem("roles") ?? "[]")
  } catch {
    return []
  }
}

function paraChaveMes(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

// Busca sem diferenciar maiúsculas nem acentos ("joao" encontra "João")
function normalizar(texto: string) {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
}

function correspondeBusca(linha: { nome?: string | null; email?: string | null; sigla?: string | null }, termo: string) {
  if (!termo) return true
  return [linha.nome, linha.email, linha.sigla].some((campo) => campo && normalizar(campo).includes(termo))
}

function formatarHoras(minutos: number) {
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`
}

// Gera um .xlsx com uma aba por tipo; exceljs só é baixado quando alguém exporta
async function exportarExcel(resumo: Resumo, mesReferencia: Date) {
  const { Workbook } = await import("exceljs")
  const workbook = new Workbook()
  const rotuloMes = mesReferencia.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })

  function adicionarAba(
    nome: string,
    colunaValor: { header: string; key: string; numFmt?: string },
    linhas: (LinhaBase & Record<string, unknown>)[],
    extra?: { header: string; key: string }
  ) {
    const aba = workbook.addWorksheet(nome)
    aba.columns = [
      { header: "Sigla", key: "sigla", width: 8 },
      { header: "Nome", key: "nome", width: 32 },
      { header: "E-mail", key: "email", width: 32 },
      { header: "Plantões", key: "plantoes", width: 10 },
      { header: colunaValor.header, key: colunaValor.key, width: 14, style: { numFmt: colunaValor.numFmt } },
      ...(extra ? [{ header: extra.header, key: extra.key, width: 12 }] : []),
    ]
    aba.getRow(1).font = { bold: true }
    aba.views = [{ state: "frozen", ySplit: 1 }]
    linhas.forEach((l) => aba.addRow(l))

    if (linhas.length > 0) {
      const ultima = linhas.length + 1
      const letraValor = aba.getColumn(colunaValor.key).letter
      const total = aba.addRow({
        nome: "Total",
        plantoes: { formula: `SUM(D2:D${ultima})` },
        [colunaValor.key]: { formula: `SUM(${letraValor}2:${letraValor}${ultima})` },
      })
      total.font = { bold: true }
    }
  }

  adicionarAba(
    "Plantonista",
    { header: "Horas", key: "horas", numFmt: "0.00" },
    resumo.plantonistas.map((l) => ({ ...l, horas: l.minutos / 60, horasFormatadas: formatarHoras(l.minutos) })),
    { header: "Horas (hh:mm)", key: "horasFormatadas" }
  )
  adicionarAba("Sócio", { header: "Pontos", key: "pontos" }, resumo.socios)

  // Casos fora: um por linha, com todos os campos do registro
  const abaCasos = workbook.addWorksheet("Casos fora")
  abaCasos.columns = [
    { header: "Data", key: "data", width: 12, style: { numFmt: "dd/mm/yyyy" } },
    { header: "Sigla", key: "sigla", width: 8 },
    { header: "Anestesista", key: "anestesista", width: 28 },
    { header: "Escalado", key: "escalado", width: 10 },
    { header: "Cirurgião", key: "cirurgiao", width: 24 },
    { header: "Paciente", key: "paciente", width: 30 },
    { header: "CPF do paciente", key: "cpf", width: 16 },
    { header: "Cirurgia realizada", key: "cirurgia", width: 30 },
    { header: "Hospital", key: "hospital", width: 18 },
    { header: "Recibo", key: "recibo", width: 12 },
    { header: "Valor", key: "valor", width: 14, style: { numFmt: '"R$" #,##0.00' } },
    { header: "Comentários", key: "comentarios", width: 40 },
  ]
  abaCasos.getRow(1).font = { bold: true }
  abaCasos.views = [{ state: "frozen", ySplit: 1 }]
  resumo.casosFora.forEach((c) =>
    abaCasos.addRow({
      // Meia-noite UTC: o Excel mostra o mesmo dia, sem deslocar pelo fuso
      data: new Date(`${c.data}T00:00:00Z`),
      // Caso com dois anestesistas: os dois na mesma linha (o valor é do caso, não se repete)
      sigla: anestesistasDe(c).map((a) => a.sigla).filter(Boolean).join(" / "),
      anestesista: anestesistasDe(c).map((a) => a.nome ?? a.email).join(" e "),
      escalado: c.escalado ? "Sim" : "Não",
      cirurgiao: c.cirurgiao,
      paciente: c.paciente_nome,
      cpf: formatarCpf(c.paciente_cpf),
      cirurgia: c.cirurgia,
      hospital: c.hospital?.nome ?? "",
      recibo: rotuloRecibo(c.recibo),
      valor: c.valor,
      comentarios: c.comentarios ?? "",
    })
  )
  if (resumo.casosFora.length > 0) {
    const letraValor = abaCasos.getColumn("valor").letter
    const total = abaCasos.addRow({
      anestesista: "Total",
      valor: { formula: `SUM(${letraValor}2:${letraValor}${resumo.casosFora.length + 1})` },
    })
    total.font = { bold: true }
  }

  const buffer = await workbook.xlsx.writeBuffer()
  const url = URL.createObjectURL(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
  )
  const link = document.createElement("a")
  link.href = url
  link.download = `BM Financeiro - ${rotuloMes}.xlsx`
  link.click()
  URL.revokeObjectURL(url)
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
  const [aba, setAba] = useState<Aba>("plantonista")
  const [busca, setBusca] = useState("")
  const [resumo, setResumo] = useState<Resumo | null>(null)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  const [autorizado, setAutorizado] = useState(false)
  const [exportando, setExportando] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem("token")) {
      router.push("/login")
      return
    }
    if (!lerRoles().some((r) => ROLES_BM_FINANCEIRO.includes(r))) {
      router.push("/dashboard")
      return
    }
    setAutorizado(true)
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
        setResumo(data)
        setError("")
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [autorizado, mes])

  function mudarMes(delta: number) {
    setMesReferencia((atual) => new Date(atual.getFullYear(), atual.getMonth() + delta, 1))
  }

  async function exportar() {
    if (!resumo) return
    setExportando(true)
    try {
      await exportarExcel(resumo, mesReferencia)
    } catch {
      setError("Não foi possível gerar o arquivo Excel.")
    } finally {
      setExportando(false)
    }
  }

  const termo = normalizar(busca.trim())
  const plantonistas = (resumo?.plantonistas ?? []).filter((l) => correspondeBusca(l, termo))
  const socios = (resumo?.socios ?? []).filter((l) => correspondeBusca(l, termo))
  const casosFora = (resumo?.casosFora ?? []).filter((c) => anestesistasDe(c).some((a) => correspondeBusca(a, termo)))
  const linhas = aba === "plantonista" ? plantonistas : socios
  const total =
    aba === "plantonista"
      ? formatarHoras(plantonistas.reduce((s, l) => s + l.minutos, 0))
      : `${formatarPontos(socios.reduce((s, l) => s + l.pontos, 0))} pts`

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-xl font-bold text-gray-800">BM Financeiro</h1>

        <div className="flex items-center gap-3">
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
            {(
              [
                { valor: "plantonista", rotulo: "Plantonista" },
                { valor: "socio", rotulo: "Sócio" },
                { valor: "casos_fora", rotulo: "Casos fora" },
              ] as const
            ).map((opcao) => (
              <button
                key={opcao.valor}
                type="button"
                onClick={() => setAba(opcao.valor)}
                className={`text-xs font-semibold px-2.5 py-1.5 rounded-md transition-colors ${
                  aba === opcao.valor ? "bg-white text-brand-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {opcao.rotulo}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={exportar}
            disabled={!resumo || loading || exportando}
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
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
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

        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar médico por nome, e-mail ou sigla"
          className="w-full sm:w-72 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent transition"
        />
      </div>

      {error && (
        <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-6">{error}</p>
      )}

      {aba === "casos_fora" ? (
        <TabelaCasosFora casos={casosFora} loading={loading} busca={termo ? busca.trim() : ""} />
      ) : (
        <div className={`bg-white rounded-xl border border-gray-200 overflow-x-auto ${loading ? "opacity-60" : ""} transition-opacity`}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-200">
                <th className="px-4 py-3">Médico</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Plantões</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">{aba === "plantonista" ? "Horas" : "Pontos"}</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-3 max-w-0 w-full">
                    <div className="flex items-center gap-3">
                      <SiglaBadge sigla={l.sigla} />
                      <div className="min-w-0">
                        <p className="font-medium text-gray-800 truncate">{l.nome ?? "—"}</p>
                        <p className="text-gray-400 text-xs truncate">{l.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700 tabular-nums">{l.plantoes}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-800 tabular-nums whitespace-nowrap">
                    {"minutos" in l ? formatarHoras(l.minutos) : `${formatarPontos(l.pontos)} pts`}
                  </td>
                </tr>
              ))}

              {!loading && linhas.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-gray-400">
                    {termo
                      ? `Nenhum médico encontrado para "${busca.trim()}".`
                      : `Nenhum ${aba === "plantonista" ? "plantonista" : "sócio"} com plantão neste mês.`}
                  </td>
                </tr>
              )}
            </tbody>
            {linhas.length > 0 && (
              <tfoot>
                <tr className="border-t border-gray-200 bg-gray-50 text-gray-800 font-semibold">
                  <td className="px-4 py-3">Total</td>
                  <td className="px-4 py-3 text-right tabular-nums">{linhas.reduce((s, l) => s + l.plantoes, 0)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{total}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </main>
  )
}

function formatarData(data: string) {
  return new Date(`${data}T00:00:00`).toLocaleDateString("pt-BR")
}

// Casos fora do mês, um por linha (o detalhe completo vai na planilha)
function TabelaCasosFora({ casos, loading, busca }: { casos: CasoFora[]; loading: boolean; busca: string }) {
  const totalValor = casos.reduce((s, c) => s + (c.valor ?? 0), 0)

  return (
    <div className={`bg-white rounded-xl border border-gray-200 overflow-x-auto ${loading ? "opacity-60" : ""} transition-opacity`}>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-200">
            <th className="px-4 py-3">Data</th>
            <th className="px-4 py-3">Anestesista</th>
            <th className="px-4 py-3 hidden sm:table-cell">Paciente</th>
            <th className="px-4 py-3 hidden md:table-cell">Hospital</th>
            <th className="px-4 py-3 hidden md:table-cell">Recibo</th>
            <th className="px-4 py-3 text-right">Valor</th>
          </tr>
        </thead>
        <tbody>
          {casos.map((c) => (
            <tr key={c.id} className="border-b border-gray-100 last:border-0">
              <td className="px-4 py-3 whitespace-nowrap">
                <p className="font-medium text-gray-800">{formatarData(c.data)}</p>
                <p className="text-xs text-gray-500">{c.escalado ? "Escalado" : "Não escalado"}</p>
              </td>
              <td className="px-4 py-3 max-w-0 w-full sm:max-w-none sm:w-auto">
                <div className="flex items-center gap-2">
                  {/* Siglas sobrepostas, uma por anestesista do caso */}
                  <div className="flex shrink-0 -space-x-1.5">
                    {anestesistasDe(c).map((a) => (
                      <span key={a.id} className="rounded-full ring-2 ring-white">
                        <SiglaBadge sigla={a.sigla} size="sm" />
                      </span>
                    ))}
                  </div>
                  <div className="min-w-0">
                    <p className="text-gray-800 truncate">{anestesistasDe(c).map((a) => a.nome ?? a.email ?? "—").join(" e ")}</p>
                    {/* No celular o paciente aparece aqui, já que a coluna fica escondida */}
                    <p className="text-xs text-gray-500 truncate sm:hidden">{c.paciente_nome}</p>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 hidden sm:table-cell max-w-[16rem]">
                <p className="text-gray-800 truncate">{c.paciente_nome}</p>
                <p className="text-xs text-gray-500 truncate">{c.cirurgia}</p>
              </td>
              <td className="px-4 py-3 hidden md:table-cell text-gray-700">{c.hospital?.nome ?? "—"}</td>
              <td className="px-4 py-3 hidden md:table-cell text-gray-700">{rotuloRecibo(c.recibo) || "—"}</td>
              <td className="px-4 py-3 text-right font-semibold text-gray-800 tabular-nums whitespace-nowrap">{formatarValor(c.valor)}</td>
            </tr>
          ))}

          {!loading && casos.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                {busca ? `Nenhum caso fora encontrado para "${busca}".` : "Nenhum caso fora neste mês."}
              </td>
            </tr>
          )}
        </tbody>
        {casos.length > 0 && (
          <tfoot>
            <tr className="border-t border-gray-200 bg-gray-50 text-gray-800 font-semibold">
              <td className="px-4 py-3">Total</td>
              <td className="px-4 py-3">
                {casos.length} {casos.length === 1 ? "caso" : "casos"}
              </td>
              <td className="hidden sm:table-cell" />
              <td className="hidden md:table-cell" colSpan={2} />
              <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">{formatarValor(totalValor)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}
