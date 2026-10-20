const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const { pontosDaVaga, categoriaDaVaga, categoriasZeradas, duasCasas } = require('../services/pontuacao')
const { buscarCoberturas, repartirPlantao } = require('../services/coberturas')
const { buscarAfastamentosNoPeriodo } = require('../services/afastamentos')
const { buscarRolesDosUsuarios, contaComoSocio } = require('../services/usuarios')
const { listarCasosFora } = require('../services/casosFora')

// Calculado na hora a partir dos plantões do mês — nada é gravado.
// O plantão não tem tipo: quem tem o cargo de sócio conta pontos pela vaga (services/pontuacao.js) e quem é só plantonista conta plantões por categoria (diurno, noturno e os dois de fim de semana).
// O noturno conta no mês em que o plantão começa.
// Troca por horas: horas e pontos da vaga são divididos na proporção das horas de cada um.
// Congresso aprovado: o médico recebe só a parte do tipo (palestrante 80%, congressista 60%).
// Os casos fora do mês vêm listados um a um, do mais antigo para o mais recente.
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
    .select('id, data, plantao_usuarios(usuario_id, posicao)')
    .gte('data', inicio)
    .lte('data', fim)

  if (error) return res.status(400).json({ error: error.message })

  let coberturas, roles, casosFora, afastamentos
  try {
    [coberturas, roles, casosFora, afastamentos] = await Promise.all([
      buscarCoberturas(plantoes.map(p => p.id)),
      buscarRolesDosUsuarios(),
      listarCasosFora({ inicio, fim }),
      buscarAfastamentosNoPeriodo(plantoes.flatMap(p => p.plantao_usuarios.map(u => u.usuario_id)), inicio, fim),
    ])
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }

  const plantonistas = new Map()
  const socios = new Map()

  // Cada vaga ocupada (ou o pedaço dela, na troca por horas) conta como um plantão de quem a fez
  for (const plantao of plantoes) {
    for (const { usuario_id, posicao, fracao } of repartirPlantao(plantao, plantao.plantao_usuarios, coberturas, afastamentos)) {
      if (contaComoSocio(roles.get(usuario_id))) {
        const acc = socios.get(usuario_id) ?? { plantoes: 0, pontos: 0 }
        acc.plantoes += 1
        acc.pontos += pontosDaVaga(plantao.data, posicao) * fracao
        socios.set(usuario_id, acc)
      } else {
        // categorias: quanto de cada plantão ele fez (1, ou a fração na troca por horas e no congresso)
        const acc = plantonistas.get(usuario_id) ?? { categorias: categoriasZeradas() }
        acc.categorias[categoriaDaVaga(plantao.data, posicao)] += fracao
        plantonistas.set(usuario_id, acc)
      }
    }
  }
  // Pontos e contagens rateados ficam com duas casas
  for (const acc of socios.values()) acc.pontos = duasCasas(acc.pontos)
  for (const acc of plantonistas.values()) {
    for (const c of Object.keys(acc.categorias)) acc.categorias[c] = duasCasas(acc.categorias[c])
    acc.total = duasCasas(Object.values(acc.categorias).reduce((s, n) => s + n, 0))
  }

  try {
    const perfis = await buscarPerfis([...plantonistas.keys(), ...socios.keys()])
    return res.json({
      mes,
      plantonistas: montarLinhas(plantonistas, perfis, 'total'),
      socios: montarLinhas(socios, perfis, 'pontos'),
      casosFora: casosFora.reverse(),
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
