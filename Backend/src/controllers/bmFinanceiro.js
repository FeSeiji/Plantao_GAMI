const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const { pontosDaPosicao } = require('../services/posicoes')
const { buscarCoberturas, repartirPlantao } = require('../services/coberturas')

// Calculado na hora a partir dos plantões do mês — nada é gravado.
// Plantões que viram a noite contam no mês em que começam.
// Troca por horas: horas e pontos da vaga são divididos na proporção das horas de cada um.
exports.resumoMensal = async (req, res) => {
  const { mes } = req.query

  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes ?? '')) {
    return res.status(400).json({ error: "mes é obrigatório no formato 'AAAA-MM'" })
  }

  const [ano, mesNum] = mes.split('-').map(Number)
  const inicio = `${mes}-01`
  const fim = `${mes}-${String(new Date(Date.UTC(ano, mesNum, 0)).getUTCDate()).padStart(2, '0')}`

  const { data: plantoes, error } = await supabase
    .from('plantoes')
    .select('id, data, hora_inicio, hora_fim, tipo, plantao_usuarios(usuario_id, posicao)')
    .gte('data', inicio)
    .lte('data', fim)

  if (error) return res.status(400).json({ error: error.message })

  let coberturas
  try {
    coberturas = await buscarCoberturas(plantoes.map(p => p.id))
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }

  const plantonistas = new Map()
  const socios = new Map()

  for (const plantao of plantoes) {
    const partes = repartirPlantao(plantao, plantao.plantao_usuarios, coberturas)
    if (plantao.tipo === 'plantonista') {
      for (const { usuario_id, minutos } of partes) {
        const acc = plantonistas.get(usuario_id) ?? { plantoes: 0, minutos: 0 }
        acc.plantoes += 1
        acc.minutos += minutos
        plantonistas.set(usuario_id, acc)
      }
    } else {
      for (const { usuario_id, posicao, fracao } of partes) {
        const acc = socios.get(usuario_id) ?? { plantoes: 0, pontos: 0 }
        acc.plantoes += 1
        acc.pontos += pontosDaPosicao(posicao) * fracao
        socios.set(usuario_id, acc)
      }
    }
  }
  // Pontos rateados ficam com duas casas
  for (const acc of socios.values()) acc.pontos = Math.round(acc.pontos * 100) / 100

  try {
    const perfis = await buscarPerfis([...plantonistas.keys(), ...socios.keys()])
    return res.json({
      mes,
      plantonistas: montarLinhas(plantonistas, perfis, 'minutos'),
      socios: montarLinhas(socios, perfis, 'pontos'),
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

function montarLinhas(acumulado, perfis, campoOrdenacao) {
  return [...acumulado.entries()]
    .map(([id, valores]) => {
      const perfil = perfis.get(id)
      return { id, nome: perfil?.nome ?? null, email: perfil?.email ?? null, sigla: perfil?.sigla ?? null, ...valores }
    })
    .sort((a, b) => b[campoOrdenacao] - a[campoOrdenacao] || (a.nome ?? '').localeCompare(b.nome ?? ''))
}

async function buscarPerfis(usuarioIds) {
  const idsUnicos = [...new Set(usuarioIds)]
  if (idsUnicos.length === 0) return new Map()

  const { data, error } = await supabase
    .from('profiles')
    .select('id, nome, email, sigla')
    .in('id', idsUnicos)

  if (error) throw error

  return new Map(data.map(perfil => [perfil.id, perfil]))
}
