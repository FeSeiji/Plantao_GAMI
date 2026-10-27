// Gera o modelo de exportação do BM (src/modelos/bm-modelo.xlsx) a partir da planilha que o cliente usa
// ("BM DEZ 26.xlsx"). O repositório é público: do arquivo deles só fica a estrutura — formatação, rótulos,
// fórmulas e constantes (custas, 0,63, alíquotas, tabela de pontos). Saem os valores digitados do mês, os
// resultados guardados das fórmulas, o vínculo com o arquivo do mês anterior (caminho do Dropbox), os
// comentários e o caminho/autor do computador do escritório.
// Uso: node scripts/limpar-modelo-bm.js "/caminho/BM DEZ 26.xlsx"
const fs = require('fs/promises')
const path = require('path')
const JSZip = require('jszip')
const { removerVinculoExterno, apagarComentarios } = require('../src/services/planilhaBm')

const DESTINO = path.join(__dirname, '../src/modelos/bm-modelo.xlsx')

// Áreas em que o escritório digita os dados do mês (as fórmulas dentro delas ficam)
const AREAS_DIGITADAS = [
  'C2:V6', // GAMI PRO sem recibo e faturamentos (PMP, GAMI)
  'C8:S22', 'C28:S52', // casos fora com recibo
  'E61:E74', 'H61:H74', // caixa da ADDS
  'B83:C124', 'F83:F124', 'H83:I124', 'L83:L124', // despesas PMP e GAMI (banco, data, valor)
  'C133:S133', 'C136:S168', // pontos, substituições, administrativo, reunião
  'C175:S176', // diferença do mês anterior e DARF
  'C179:S181', // pró-labore e distribuições
  'C192:S196', // pagamentos nos bancos
]

const colunaParaNumero = col => [...col].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0)

function dentroDe(ref, area) {
  const [, col, linha] = ref.match(/^([A-Z]+)(\d+)$/)
  const [ini, fim] = area.split(':').map(r => r.match(/^([A-Z]+)(\d+)$/))
  const c = colunaParaNumero(col)
  return c >= colunaParaNumero(ini[1]) && c <= colunaParaNumero(fim[1]) && +linha >= +ini[2] && +linha <= +fim[2]
}

async function main() {
  const origem = process.argv[2]
  if (!origem) throw new Error('Informe o caminho da planilha do cliente')
  const zip = await JSZip.loadAsync(await fs.readFile(origem))

  let planilha = await zip.file('xl/worksheets/sheet1.xml').async('string')
  let limpas = 0
  planilha = planilha.replace(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, (celula, ref, attrs, conteudo) => {
    const estilo = attrs.match(/\ss="\d+"/)?.[0] ?? ''
    // Vínculo com o arquivo do mês anterior: a célula fica vazia, para digitar
    if (conteudo?.includes('<f>[')) return `<c r="${ref}"${estilo}/>`
    // Fórmula: fica sem o último resultado guardado
    if (conteudo?.includes('<f')) return `<c r="${ref}"${attrs.replace(/\st="\w+"/, '')}>${conteudo.replace(/<v>[\s\S]*?<\/v>/, '')}</c>`
    if (conteudo && AREAS_DIGITADAS.some(area => dentroDe(ref, area))) {
      limpas++
      return `<c r="${ref}"${estilo}/>`
    }
    return celula
  })
  zip.file('xl/worksheets/sheet1.xml', planilha)

  await removerVinculoExterno(zip)
  await apagarComentarios(zip)

  // Caminho da pasta e nomes do computador de quem salvou
  const workbook = await zip.file('xl/workbook.xml').async('string')
  zip.file('xl/workbook.xml', workbook.replace(/<mc:AlternateContent[\s\S]*?<\/mc:AlternateContent>/, ''))
  const core = await zip.file('docProps/core.xml').async('string')
  zip.file('docProps/core.xml', core.replace(/<dc:creator>[^<]*<\/dc:creator>/, '').replace(/<cp:lastModifiedBy>[^<]*<\/cp:lastModifiedBy>/, ''))

  await fs.writeFile(DESTINO, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }))
  console.log(`Modelo salvo em ${DESTINO} (${limpas} células digitadas apagadas)`)
}

main().catch(err => {
  console.error(err.message)
  process.exit(1)
})
