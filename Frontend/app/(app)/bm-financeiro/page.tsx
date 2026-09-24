"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import SiglaBadge from "../../../components/SiglaBadge"

// Todos menos o plantonista
const ROLES_BM_FINANCEIRO = ["admin", "anestesita_socio", "tecnico"]

type Aba = "plantonista" | "socio"

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

function correspondeBusca(linha: LinhaBase, termo: string) {
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
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/bm-financeiro?mes=${mes}`, {
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
  const linhas = aba === "plantonista" ? plantonistas : socios
  const total =
    aba === "plantonista"
      ? formatarHoras(plantonistas.reduce((s, l) => s + l.minutos, 0))
      : `${socios.reduce((s, l) => s + l.pontos, 0)} pts`

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

      <div className={`bg-white rounded-xl border border-gray-200 overflow-x-auto ${loading ? "opacity-60" : ""} transition-opacity`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-200">
              <th className="px-4 py-3">Médico</th>
              <th className="px-4 py-3 text-right">Plantões</th>
              <th className="px-4 py-3 text-right">{aba === "plantonista" ? "Horas trabalhadas" : "Pontos"}</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <SiglaBadge sigla={l.sigla} />
                    <div className="min-w-0">
                      <p className="font-medium text-gray-800 truncate">{l.nome ?? "—"}</p>
                      <p className="text-gray-400 text-xs truncate">{l.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-right text-gray-700 tabular-nums">{l.plantoes}</td>
                <td className="px-4 py-3 text-right font-semibold text-gray-800 tabular-nums">
                  {"minutos" in l ? formatarHoras(l.minutos) : `${l.pontos} pts`}
                </td>
              </tr>
            ))}

            {!loading && linhas.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-gray-400">
                  {termo
                    ? `Nenhum médico encontrado para "${busca.trim()}".`
                    : `Nenhum plantão ${aba === "plantonista" ? "de plantonista" : "de sócio"} neste mês.`}
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
    </main>
  )
}
