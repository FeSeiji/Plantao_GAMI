const { montarBm } = require('../services/bm')
const { gerarPlanilhaBm } = require('../services/planilhaBm')
const { salvarFinanceiro, criarItemDespesa, atualizarItemDespesa } = require('../services/financeiroBm')

const MESES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']

const mesValido = mes => /^\d{4}-(0[1-9]|1[0-2])$/.test(mes ?? '')

// BM do mês no formato da planilha do cliente (services/bm.js). Calculado na hora — nada é gravado
exports.resumoMensal = async (req, res) => {
  const { mes } = req.query
  if (!mesValido(mes)) return res.status(400).json({ error: "mes é obrigatório no formato 'AAAA-MM'" })

  try {
    return res.json(await montarBm(mes))
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

// O mesmo BM no modelo de Excel do cliente, com o nome que eles usam ("BM OUT 26.xlsx")
exports.exportar = async (req, res) => {
  const { mes } = req.query
  if (!mesValido(mes)) return res.status(400).json({ error: "mes é obrigatório no formato 'AAAA-MM'" })

  try {
    const arquivo = await gerarPlanilhaBm(await montarBm(mes))
    const [ano, mesNum] = mes.split('-')
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="BM ${MESES[Number(mesNum) - 1]} ${ano.slice(2)}.xlsx"`)
    return res.send(arquivo)
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Não foi possível gerar o Excel do BM.' })
  }
}

// Grava os valores digitados do mês (faturamento, valor do plantão, valores por sócio, despesas).
// Corpo em services/financeiroBm.js (salvarFinanceiro). Todos os meses continuam editáveis
exports.salvarFinanceiro = async (req, res) => {
  const { mes } = req.query
  if (!mesValido(mes)) return res.status(400).json({ error: "mes é obrigatório no formato 'AAAA-MM'" })

  try {
    const resultado = await salvarFinanceiro(mes, req.body, req.user.id)
    if (resultado.error) return res.status(400).json({ error: resultado.error })
    return res.status(204).send()
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: err.message })
  }
}

// Corpo: empresa ('pmp' ou 'gami') e nome
exports.criarItemDespesa = async (req, res) => {
  try {
    const resultado = await criarItemDespesa(req.body ?? {}, req.user.id)
    if (resultado.error) return res.status(400).json({ error: resultado.error })
    return res.status(201).json(resultado.item)
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: err.message })
  }
}

// Corpo: nome e/ou ativo
exports.atualizarItemDespesa = async (req, res) => {
  try {
    const resultado = await atualizarItemDespesa(req.params.id, req.body ?? {}, req.user.id)
    if (resultado.error) return res.status(resultado.status ?? 400).json({ error: resultado.error })
    return res.json(resultado.item)
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: err.message })
  }
}
