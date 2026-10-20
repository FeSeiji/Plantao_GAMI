// Planilha do ano no modelo da planilha de férias do cliente: uma coluna por mês (janeiro a junho, o número
// do dia, julho a dezembro), uma linha por dia e, em cada célula, as siglas de quem está fora ("PG/VI").
// Cada médico tem uma cor, e a célula pega a do primeiro de férias nela; congresso leva "*" na sigla, como no
// modelo. Embaixo vêm a legenda, os congressos e, ao lado, os dias de férias e de congresso de cada um.
// exceljs só é baixado quando alguém exporta

export type AfastamentoExportado = {
  tipo: "ferias" | "congresso"
  data_inicio: string
  data_fim: string
  observacao: string | null
  usuario: { id: string; nome?: string | null; email?: string | null; sigla?: string | null }
}

const MESES = [
  "JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO",
  "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO",
]

// Cores fortes e bem diferentes entre si, como as do modelo; depois da 20ª elas se repetem
const CORES = [
  "FFFFC000", "FFFFFF00", "FF7F0000", "FF0000FF", "FF7030A0", "FFFF6600", "FF9DC3E6", "FFA9D08E", "FF44546A", "FFC00000",
  "FF00B0F0", "FFF4B183", "FFFFD966", "FF00B050", "FFB4A7D6", "FF8B4513", "FFFF66CC", "FF2F5597", "FF808000", "FF20B2AA",
]
const COR_CONGRESSO = "FFD9D9D9" // célula só com gente em congresso
const COR_DIA_INEXISTENTE = "FFF2F2F2" // 30 de fevereiro etc.

type Ocupante = { usuarioId: string; sigla: string; congresso: boolean }

const siglaDe = (u: AfastamentoExportado["usuario"]) => u.sigla ?? u.nome?.split(" ")[0] ?? "?"

function formatarDia(data: string) {
  const [, mes, dia] = data.split("-")
  return `${dia}/${mes}`
}

// Texto branco em fundo escuro, preto em fundo claro
function corDoTexto(argb: string) {
  const [r, g, b] = [2, 4, 6].map((i) => parseInt(argb.slice(i, i + 2), 16))
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "FF000000" : "FFFFFFFF"
}

// Dias corridos do período dentro do ano ("AAAA-MM-DD", em UTC para não escorregar pelo fuso)
function diasNoAno(a: AfastamentoExportado, ano: number) {
  const inicio = a.data_inicio < `${ano}-01-01` ? `${ano}-01-01` : a.data_inicio
  const fim = a.data_fim > `${ano}-12-31` ? `${ano}-12-31` : a.data_fim
  const dias: string[] = []
  for (let d = new Date(`${inicio}T00:00:00Z`); d.toISOString().slice(0, 10) <= fim; d.setUTCDate(d.getUTCDate() + 1)) {
    dias.push(d.toISOString().slice(0, 10))
  }
  return dias
}

export async function exportarFeriasDoAno(afastamentos: AfastamentoExportado[], ano: number) {
  const { Workbook } = await import("exceljs")
  const workbook = new Workbook()
  const aba = workbook.addWorksheet(`Férias ${ano}`)

  // Médicos na ordem da sigla, cada um com a sua cor
  const medicos = [...new Map(afastamentos.map((a) => [a.usuario.id, a.usuario])).values()].sort((a, b) =>
    siglaDe(a).localeCompare(siglaDe(b), "pt-BR"),
  )
  const corDe = new Map(medicos.map((m, i) => [m.id, CORES[i % CORES.length]]))

  // Quem está fora em cada dia ("AAAA-MM-DD"), na ordem em que os períodos começam
  const porDia = new Map<string, Ocupante[]>()
  const diasDe = new Map<string, { ferias: number; congresso: number }>()
  for (const a of [...afastamentos].sort((x, y) => x.data_inicio.localeCompare(y.data_inicio))) {
    const dias = diasNoAno(a, ano)
    const total = diasDe.get(a.usuario.id) ?? { ferias: 0, congresso: 0 }
    total[a.tipo] += dias.length
    diasDe.set(a.usuario.id, total)
    for (const dia of dias) {
      const lista = porDia.get(dia) ?? []
      lista.push({ usuarioId: a.usuario.id, sigla: siglaDe(a.usuario), congresso: a.tipo === "congresso" })
      porDia.set(dia, lista)
    }
  }

  // Colunas: A dia | B–G janeiro a junho | H dia | I–N julho a dezembro | O dia
  const colunaDoMes = (mes: number) => (mes < 6 ? 2 + mes : 3 + mes)
  const COLUNAS_DIA = [1, 8, 15]
  aba.columns = Array.from({ length: 15 }, (_, i) => ({ width: COLUNAS_DIA.includes(i + 1) ? 4 : 16 }))

  const borda = { style: "thin" as const }
  const bordas = { top: borda, left: borda, bottom: borda, right: borda }
  const centro = { horizontal: "center" as const, vertical: "middle" as const }

  aba.getCell(1, 2).value = `FÉRIAS E CONGRESSOS ${ano}`
  aba.getCell(1, 2).font = { bold: true, size: 14 }

  const cabecalho = aba.getRow(2)
  MESES.forEach((nome, mes) => (cabecalho.getCell(colunaDoMes(mes)).value = nome))
  cabecalho.eachCell((cell) => {
    cell.font = { bold: true }
    cell.alignment = centro
    cell.border = bordas
  })

  for (let dia = 1; dia <= 31; dia++) {
    const linha = aba.getRow(2 + dia)
    for (const coluna of COLUNAS_DIA) {
      const cell = linha.getCell(coluna)
      cell.value = dia
      cell.alignment = centro
      cell.border = bordas
    }
    MESES.forEach((_, mes) => {
      const cell = linha.getCell(colunaDoMes(mes))
      cell.border = bordas
      cell.alignment = centro
      // O dia não existe nesse mês (o Date "vira" para o mês seguinte)
      if (new Date(Date.UTC(ano, mes, dia)).getUTCMonth() !== mes) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR_DIA_INEXISTENTE } }
        return
      }
      const data = `${ano}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`
      const ocupantes = porDia.get(data)
      if (!ocupantes) return
      cell.value = ocupantes.map((o) => `${o.sigla}${o.congresso ? "*" : ""}`).join("/")
      const deFerias = ocupantes.find((o) => !o.congresso)
      const cor = deFerias ? corDe.get(deFerias.usuarioId)! : COR_CONGRESSO
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: cor } }
      cell.font = { color: { argb: corDoTexto(cor) }, bold: true }
    })
  }

  // Legenda (nome e sigla na cor do médico), começando duas linhas abaixo da grade
  let linha = 36
  aba.getCell(linha, 2).value = "LEGENDA"
  aba.getCell(linha, 2).font = { bold: true }
  for (const m of medicos) {
    linha++
    aba.getCell(linha, 2).value = m.nome ?? m.email ?? ""
    const cell = aba.getCell(linha, 3)
    const cor = corDe.get(m.id)!
    cell.value = siglaDe(m)
    cell.alignment = centro
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: cor } }
    cell.font = { color: { argb: corDoTexto(cor) }, bold: true }
  }

  // Congressos: um por evento (observação + datas), com as siglas de quem foi
  const congressos = new Map<string, { nome: string; inicio: string; fim: string; siglas: string[] }>()
  for (const a of afastamentos.filter((x) => x.tipo === "congresso")) {
    const chave = `${a.observacao ?? ""}|${a.data_inicio}|${a.data_fim}`
    const evento = congressos.get(chave) ?? { nome: a.observacao ?? "Congresso", inicio: a.data_inicio, fim: a.data_fim, siglas: [] }
    evento.siglas.push(siglaDe(a.usuario))
    congressos.set(chave, evento)
  }
  linha = 36
  aba.getCell(linha, 5).value = "CONGRESSOS (* na grade)"
  aba.getCell(linha, 5).font = { bold: true }
  for (const e of [...congressos.values()].sort((x, y) => x.inicio.localeCompare(y.inicio))) {
    linha++
    const datas = e.inicio === e.fim ? formatarDia(e.inicio) : `${formatarDia(e.inicio)} a ${formatarDia(e.fim)}`
    aba.getCell(linha, 5).value = `${e.nome} — ${datas}: ${e.siglas.join(", ")}`
  }

  // Dias de cada médico no ano, ao lado da grade (como a coluna "Solicitados" do modelo)
  aba.getColumn(17).width = 8
  aba.getColumn(18).width = 10
  aba.getColumn(19).width = 12
  const titulos = aba.getRow(2)
  ;["Sigla", "Férias", "Congresso"].forEach((t, i) => {
    const cell = titulos.getCell(17 + i)
    cell.value = t
    cell.font = { bold: true }
    cell.alignment = centro
    cell.border = bordas
  })
  medicos.forEach((m, i) => {
    const r = aba.getRow(3 + i)
    const dias = diasDe.get(m.id)!
    ;[siglaDe(m), dias.ferias, dias.congresso].forEach((valor, j) => {
      const cell = r.getCell(17 + j)
      cell.value = valor
      cell.alignment = centro
      cell.border = bordas
    })
  })

  aba.views = [{ state: "frozen", ySplit: 2 }]

  const buffer = await workbook.xlsx.writeBuffer()
  const url = URL.createObjectURL(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
  )
  const link = document.createElement("a")
  link.href = url
  link.download = `Férias e congressos ${ano}.xlsx`
  link.click()
  URL.revokeObjectURL(url)
}
