const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Posição 1 vale 7 pontos, posição 7 vale 1
const PONTOS_MAXIMOS = 8

// Calculado na hora a partir dos plantões do mês — nada é gravado.
// Plantões que viram a noite contam no mês em que começam.
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

  const plantonistas = new Map()
  const socios = new Map()

  for (const plantao of plantoes) {
    if (plantao.tipo === 'plantonista') {
      const minutos = duracaoEmMinutos(plantao.hora_inicio, plantao.hora_fim)
      for (const { usuario_id } of plantao.plantao_usuarios) {
        const acc = plantonistas.get(usuario_id) ?? { plantoes: 0, minutos: 0 }
        acc.plantoes += 1
        acc.minutos += minutos
        plantonistas.set(usuario_id, acc)
      }
    } else {
      for (const { usuario_id, posicao } of plantao.plantao_usuarios) {
        const acc = socios.get(usuario_id) ?? { plantoes: 0, pontos: 0 }
        acc.plantoes += 1
        acc.pontos += posicao != null ? PONTOS_MAXIMOS - posicao : 0
        socios.set(usuario_id, acc)
      }
    }
  }

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

// hora_fim <= hora_inicio significa que o plantão termina no dia seguinte
function duracaoEmMinutos(horaInicio, horaFim) {
  const inicio = paraMinutos(horaInicio)
  let fim = paraMinutos(horaFim)
  if (fim <= inicio) fim += 24 * 60
  return fim - inicio
}

function paraMinutos(hora) {
  const [h, m] = hora.split(':').map(Number)
  return h * 60 + m
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
