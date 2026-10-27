const fs = require('fs/promises')
const path = require('path')
const JSZip = require('jszip')

// Exportação do BM no modelo do cliente (modelos/bm-modelo.xlsx, cópia do BM DEZ 26.xlsx que eles usam).
// O arquivo não é regravado por uma biblioteca de planilha: só o valor das células que o sistema preenche muda
// dentro do XML, e o resto (formatação, fórmulas, comentários) continua exatamente como no modelo. O Excel
// recalcula as fórmulas ao abrir.
// Linhas do modelo que o sistema preenche (as demais são digitadas pelo escritório, por enquanto):
//   1, 132 e 190: siglas  ·  T2, U2, V2: faturamento PMP, recibos GAMI e GAMI total  ·  2: GAMI PRO sem recibo
//   8–22: casos fora escalados  ·  28–52: não escalados  ·  133: VALOR (pontos da escala)
//   134: fator de correção  ·  136–166: substituições e ajustes "Outro"  ·  167: Administrativo  ·  168: Reunião
// A linha 175 (DIF MÊS ANTERIOR) puxava a aba do mês anterior de outro arquivo (BM 2026.xlsx, no Dropbox):
// o vínculo sai e a linha fica para digitar.
const MODELO = path.join(__dirname, '../modelos/bm-modelo.xlsx')

const COLUNAS_SOCIOS = 'CDEFGHIJKLMNOPQRS'.split('') // 17 colunas: as 14 da planilha e 3 livres
const LINHAS_SIGLAS = [1, 132, 190]
const LINHA_GAMI_PRO_SEM_RECIBO = 2
const FATURAMENTO = { faturamento_pmp: 'T2', recibos_gami: 'U2', gami_total: 'V2' }
const ESCALADO = { primeira: 8, ultima: 22 }
const NAO_ESCALADO = { primeira: 28, ultima: 52 }
const LINHA_VALOR = 133
const LINHA_FATOR = 134
const SUBSTITUICOES = { primeira: 136, ultima: 166 }
const LINHA_ADMINISTRATIVO = 167
const LINHA_REUNIAO = 168
const LINHA_DIF_MES_ANTERIOR = 175

const ROTULO_RECIBO = { gami: 'GAMI/ADDS', sem_recibo: 'Sem nota fiscal' }
const ROTULO_CATEGORIA = { diurno: 'Diurno', noturno: 'Noturno', diurno_fds: 'Diurno fim de semana', noturno_fds: 'Noturno fim de semana' }

// bm: o resultado de montarBm. Retorna o .xlsx em um Buffer
async function gerarPlanilhaBm(bm) {
  if (bm.socios.length > COLUNAS_SOCIOS.length) {
    throw new Error(`O modelo tem ${COLUNAS_SOCIOS.length} colunas de sócio e o BM tem ${bm.socios.length} sócios`)
  }

  const zip = await JSZip.loadAsync(await fs.readFile(MODELO))
  const planilha = new Planilha(await zip.file('xl/worksheets/sheet1.xml').async('string'))
  const colunaDe = new Map(bm.socios.map((s, i) => [s.id, COLUNAS_SOCIOS[i]]))
  const porColuna = (linha, valores) =>
    COLUNAS_SOCIOS.forEach((col, i) => planilha.definir(`${col}${linha}`, valores(bm.socios[i], i) ?? null))

  const { financeiro } = bm
  for (const linha of LINHAS_SIGLAS) porColuna(linha, s => s?.sigla)
  for (const [campo, ref] of Object.entries(FATURAMENTO)) planilha.definir(ref, financeiro[campo])
  porColuna(LINHA_GAMI_PRO_SEM_RECIBO, s => (s ? financeiro.socios[s.id]?.gami_pro_sem_recibo : null))
  porColuna(LINHA_VALOR, s => s?.valor_escala)
  porColuna(LINHA_FATOR, s => (s ? financeiro.socios[s.id]?.fator_correcao ?? 1 : null))

  // Casos fora: um por linha, a parte de cada sócio na coluna dele e a data + hospital no rótulo (coluna B)
  const casos = bm.casosForaRecibo.map(c => ({
    rotulo: [formatarDiaMes(c.data), c.hospital ?? c.cirurgia].filter(Boolean).join(' '),
    pontos: c.partes,
  }))
  preencherBloco(planilha, colunaDe, ESCALADO, casos.filter((_, i) => bm.casosForaRecibo[i].escalado), 'casos')
  preencherBloco(planilha, colunaDe, NAO_ESCALADO, casos.filter((_, i) => !bm.casosForaRecibo[i].escalado), 'casos')

  // Substituições (− para quem saiu, + para quem entrou) e depois os ajustes "Outro", com o motivo
  const linhasSubstituicao = [
    ...bm.substituicoes.map(s => ({ rotulo: rotuloSubstituicao(s), pontos: s.pontos })),
    ...bm.ajustes
      .filter(a => a.tipo === 'outro')
      .map(a => ({ rotulo: `Ajuste: ${a.motivo}`, pontos: { [a.medico.id]: a.pontos } })),
  ]
  preencherBloco(planilha, colunaDe, SUBSTITUICOES, linhasSubstituicao, 'linhas')

  const somaDoTipo = tipo => {
    const soma = new Map()
    for (const a of bm.ajustes.filter(x => x.tipo === tipo)) soma.set(a.medico.id, (soma.get(a.medico.id) ?? 0) + a.pontos)
    return s => (s && soma.has(s.id) ? arredondar(soma.get(s.id)) : null)
  }
  porColuna(LINHA_ADMINISTRATIVO, somaDoTipo('administrativo'))
  porColuna(LINHA_REUNIAO, somaDoTipo('reuniao'))

  for (const col of COLUNAS_SOCIOS) planilha.definir(`${col}${LINHA_DIF_MES_ANTERIOR}`, null, { trocarFormula: true })
  planilha.apagarResultadosGuardados()

  zip.file('xl/worksheets/sheet1.xml', planilha.xml)
  await removerVinculoExterno(zip)
  await adicionarAbas(zip, [
    { nome: 'Plantonistas', ...abaPlantonistas(bm.plantonistas) },
    { nome: 'Casos fora', ...abaCasosFora(bm.casosFora) },
  ])

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

// Um bloco de linhas do modelo (casos fora ou substituições): uma linha por item, com o rótulo na coluna B.
// Se passar do tamanho do bloco, a última linha soma o que sobrou. Linhas sem item ficam vazias.
function preencherBloco(planilha, colunaDe, { primeira, ultima }, itens, nomeDoResto) {
  const capacidade = ultima - primeira + 1
  let linhas = itens
  if (itens.length > capacidade) {
    const resto = itens.slice(capacidade - 1)
    const soma = {}
    for (const item of resto) for (const [id, v] of Object.entries(item.pontos)) soma[id] = (soma[id] ?? 0) + v
    linhas = [...itens.slice(0, capacidade - 1), { rotulo: `Demais ${resto.length} ${nomeDoResto}`, pontos: soma }]
  }

  for (let i = 0; i < capacidade; i++) {
    const linha = primeira + i
    const item = linhas[i]
    planilha.definir(`B${linha}`, item?.rotulo ?? null)
    for (const col of COLUNAS_SOCIOS) planilha.definir(`${col}${linha}`, null)
    if (!item) continue
    for (const [id, valor] of Object.entries(item.pontos)) {
      const col = colunaDe.get(id)
      if (col) planilha.definir(`${col}${linha}`, arredondar(valor))
    }
  }
}

function rotuloSubstituicao(s) {
  const quem = `${s.saida.sigla ?? '?'}→${s.entrada.sigla ?? '?'}`
  const detalhe = s.tipo === 'ferias'
    ? ' férias'
    : s.tipo === 'horas'
      ? ` ${s.hora_inicio.slice(0, 5)}–${s.hora_fim.slice(0, 5)}`
      : ''
  return `${formatarDiaMes(s.data)} ${quem}${detalhe}`
}

const formatarDiaMes = data => `${data.slice(8, 10)}/${data.slice(5, 7)}`
const formatarData = data => `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(0, 4)}`
const arredondar = n => Math.round(n * 100) / 100

const escaparXml = texto =>
  String(texto).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// A aba do modelo como texto XML; definir troca o conteúdo de uma célula que já existe, mantendo o estilo dela
class Planilha {
  constructor(xml) {
    this.xml = xml
  }

  // valor: número, texto ou null (célula vazia). Célula com fórmula só muda com trocarFormula, para o
  // preenchimento nunca apagar uma conta da planilha por engano
  definir(ref, valor, { trocarFormula = false } = {}) {
    const re = new RegExp(`<c r="${ref}"([^>]*?)(?:/>|>([\\s\\S]*?)</c>)`)
    const atual = this.xml.match(re)
    if (!atual) throw new Error(`A célula ${ref} não existe no modelo`)
    if (atual[2]?.includes('<f') && !trocarFormula) throw new Error(`A célula ${ref} do modelo tem fórmula`)

    const estilo = atual[1].match(/\ss="\d+"/)?.[0] ?? ''
    let nova
    if (valor === null || valor === undefined || valor === '') nova = `<c r="${ref}"${estilo}/>`
    else if (typeof valor === 'number') nova = `<c r="${ref}"${estilo}><v>${valor}</v></c>`
    else nova = `<c r="${ref}"${estilo} t="inlineStr"><is><t xml:space="preserve">${escaparXml(valor)}</t></is></c>`

    this.xml = this.xml.replace(re, () => nova)
  }

  // O modelo traz o último resultado de cada fórmula (os números do mês em que foi salvo). Sem eles, quem abre
  // o arquivo vê a conta refeita com os dados do sistema, e não um número velho, mesmo num visualizador que não
  // recalcula. O tipo da célula (t="str", t="e"...) era do resultado e sai junto
  apagarResultadosGuardados() {
    this.xml = this.xml.replace(
      /<c ([^>]*?)>(<f[^>]*\/>|<f[^>]*>[\s\S]*?<\/f>)<v>[\s\S]*?<\/v><\/c>/g,
      (_, attrs, formula) => `<c ${attrs.replace(/\st="\w+"/, '')}>${formula}</c>`
    )
  }
}

// Tira o vínculo com o arquivo do mês anterior e a cadeia de cálculo (o Excel refaz a dele) e pede ao Excel
// para recalcular tudo ao abrir, já que as células preenchidas mudaram
async function removerVinculoExterno(zip) {
  const pastaVinculos = Object.keys(zip.files).filter(n => n.startsWith('xl/externalLinks/'))
  pastaVinculos.forEach(n => zip.remove(n))
  zip.remove('xl/calcChain.xml')

  await editar(zip, 'xl/workbook.xml', xml =>
    xml
      .replace(/<externalReferences>[\s\S]*?<\/externalReferences>/, '')
      .replace(/<calcPr([^>]*?)\s*\/>/, (_, attrs) => `<calcPr${attrs.replace(/\sfullCalcOnLoad="\w+"/, '')} fullCalcOnLoad="1"/>`)
      .replace('<sheet name="Sheet1"', '<sheet name="BM"')
  )
  await editar(zip, 'xl/_rels/workbook.xml.rels', xml =>
    xml.replace(/<Relationship [^>]*Type="[^"]*\/(externalLink|calcChain)"[^>]*\/>/g, '')
  )
  await editar(zip, '[Content_Types].xml', xml =>
    xml.replace(/<Override PartName="\/xl\/(externalLinks\/[^"]+|calcChain\.xml)"[^>]*\/>/g, '')
  )
}

// Tira os comentários das células (o modelo do cliente tinha um com valores do pró-labore)
async function apagarComentarios(zip) {
  for (const nome of Object.keys(zip.files)) {
    if (/^xl\/(comments\d*\.xml|drawings\/vmlDrawing\d*\.vml|worksheets\/_rels\/sheet1\.xml\.rels)$/.test(nome)) zip.remove(nome)
  }
  await editar(zip, 'xl/worksheets/sheet1.xml', xml => xml.replace(/<legacyDrawing [^>]*\/>/, ''))
  await editar(zip, '[Content_Types].xml', xml => xml.replace(/<Override PartName="\/xl\/comments\d*\.xml"[^>]*\/>/g, ''))
}

// Abas extras, só com texto e números (sem estilo): [{ nome, larguras, linhas }]; a primeira linha é o cabeçalho
async function adicionarAbas(zip, abas) {
  let workbook = await zip.file('xl/workbook.xml').async('string')
  let rels = await zip.file('xl/_rels/workbook.xml.rels').async('string')
  let tipos = await zip.file('[Content_Types].xml').async('string')

  abas.forEach((aba, i) => {
    const numero = i + 2
    const relId = `rIdBmAba${numero}`
    zip.file(`xl/worksheets/sheet${numero}.xml`, xmlDaAba(aba))
    workbook = workbook.replace('</sheets>', `<sheet name="${escaparXml(aba.nome)}" sheetId="${numero}" r:id="${relId}"/></sheets>`)
    rels = rels.replace(
      '</Relationships>',
      `<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${numero}.xml"/></Relationships>`
    )
    tipos = tipos.replace(
      '</Types>',
      `<Override PartName="/xl/worksheets/sheet${numero}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`
    )
  })

  zip.file('xl/workbook.xml', workbook)
  zip.file('xl/_rels/workbook.xml.rels', rels)
  zip.file('[Content_Types].xml', tipos)
}

function xmlDaAba({ larguras, linhas }) {
  const letra = i => String.fromCharCode(65 + i)
  const celula = (valor, ref) => {
    if (valor === null || valor === undefined || valor === '') return ''
    if (typeof valor === 'number') return `<c r="${ref}"><v>${valor}</v></c>`
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escaparXml(valor)}</t></is></c>`
  }
  const cols = larguras.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')
  const rows = linhas
    .map((linha, r) => `<row r="${r + 1}">${linha.map((v, c) => celula(v, `${letra(c)}${r + 1}`)).join('')}</row>`)
    .join('')
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    `<cols>${cols}</cols><sheetData>${rows}</sheetData></worksheet>`
  )
}

function abaPlantonistas(plantonistas) {
  const categorias = Object.keys(ROTULO_CATEGORIA)
  return {
    larguras: [8, 32, 12, 12, 22, 22, 10],
    linhas: [
      ['Sigla', 'Nome', ...categorias.map(c => ROTULO_CATEGORIA[c]), 'Total'],
      ...plantonistas.map(p => [p.sigla, p.nome ?? p.email, ...categorias.map(c => p.categorias[c]), p.total]),
    ],
  }
}

function abaCasosFora(casos) {
  const anestesistas = c => [c.anestesista, c.segundoAnestesista].filter(Boolean)
  return {
    larguras: [12, 10, 32, 10, 24, 30, 16, 30, 18, 16, 14, 40],
    linhas: [
      ['Data', 'Sigla', 'Anestesista', 'Escalado', 'Cirurgião', 'Paciente', 'CPF do paciente', 'Cirurgia realizada', 'Hospital', 'Recibo', 'Valor', 'Comentários'],
      ...casos.map(c => [
        formatarData(c.data),
        anestesistas(c).map(a => a.sigla).filter(Boolean).join(' / '),
        anestesistas(c).map(a => a.nome ?? a.email).join(' e '),
        c.escalado ? 'Sim' : 'Não',
        c.cirurgiao,
        c.paciente_nome,
        c.paciente_cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4'),
        c.cirurgia,
        c.hospital?.nome ?? '',
        ROTULO_RECIBO[c.recibo] ?? '',
        c.valor,
        c.comentarios ?? '',
      ]),
    ],
  }
}

async function editar(zip, nome, transformar) {
  zip.file(nome, transformar(await zip.file(nome).async('string')))
}

module.exports = { gerarPlanilhaBm, removerVinculoExterno, apagarComentarios }
