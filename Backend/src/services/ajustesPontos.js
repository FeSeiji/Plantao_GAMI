const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const { buscarEmPaginas } = require('./paginas')

const CAMPOS_AJUSTE = 'id, usuario_id, tipo, pontos, motivo, criado_por, criado_em, atualizado_por, atualizado_em'

// Ajustes manuais de pontos do mês (os excluídos ficam só no histórico) e o histórico deles, do mais recente
// para o mais antigo. Cada edição traz em `anterior` o tipo, os pontos e o motivo de antes, para a tela mostrar o que mudou.
// inicioDoMes: 'AAAA-MM-01'
async function buscarAjustesDoMes(inicioDoMes) {
  const [ajustes, historico] = await Promise.all([
    supabase
      .from('ajustes_pontos')
      .select(CAMPOS_AJUSTE)
      .eq('mes', inicioDoMes)
      .is('excluido_em', null)
      .order('criado_em'),
    supabase
      .from('ajustes_pontos_historico')
      .select('id, ajuste_id, acao, usuario_id, tipo, pontos, motivo, feito_por, feito_em')
      .eq('mes', inicioDoMes)
      .order('feito_em'),
  ])
  if (ajustes.error) throw ajustes.error
  if (historico.error) throw historico.error

  const ultimoDoAjuste = new Map()
  const eventos = historico.data.map(evento => {
    const anterior = ultimoDoAjuste.get(evento.ajuste_id)
    ultimoDoAjuste.set(evento.ajuste_id, evento)
    return {
      ...evento,
      anterior: evento.acao === 'editado' && anterior
        ? { tipo: anterior.tipo, pontos: anterior.pontos, motivo: anterior.motivo }
        : null,
    }
  })

  return { ajustes: ajustes.data, historico: eventos.reverse() }
}

// Ajustes (não excluídos) de vários meses de uma vez, com o mês de cada um, sem o histórico: é o que a conta corrente
// em cascata usa. primeiro e ultimo: 'AAAA-MM-01'
async function buscarAjustesDoPeriodo(primeiro, ultimo) {
  return buscarEmPaginas(() =>
    supabase
      .from('ajustes_pontos')
      .select(`mes, ${CAMPOS_AJUSTE}`)
      .gte('mes', primeiro)
      .lte('mes', ultimo)
      .is('excluido_em', null)
      .order('criado_em')
      .order('id')
  )
}

// Tipo do ajuste: a linha em que ele cai no BM (Administrativo e Reunião têm linha própria, como na planilha)
const TIPOS_AJUSTE = ['administrativo', 'reuniao', 'outro']

module.exports = { CAMPOS_AJUSTE, TIPOS_AJUSTE, buscarAjustesDoMes, buscarAjustesDoPeriodo }
