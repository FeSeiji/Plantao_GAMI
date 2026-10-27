const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const { ehVagaDeCoordenador, turnoJaComecou, horaLocal } = require('./posicoes')

// Esvazia a vaga do membro { id, usuario_id, posicao } no plantão { id, data }. A troca pendente da vaga (e a troca por horas valendo)
// perde o sentido, mas continua no histórico como cancelada; a remoção fica no histórico do plantão
async function esvaziarVaga(plantao, membro, porId) {
  const { error } = await supabase
    .from('plantao_usuarios')
    .delete()
    .eq('id', membro.id)

  if (error) throw error

  const { error: trocaError } = await supabase
    .from('plantao_trocas')
    .update({ status: 'cancelada', respondido_em: new Date().toISOString() })
    .eq('plantao_id', plantao.id)
    .eq('posicao', membro.posicao)
    .eq('usuario_saida', membro.usuario_id)
    .or('status.eq.pendente,and(status.eq.aceita,hora_inicio.not.is.null)')

  if (trocaError) throw trocaError

  const { error: logError } = await supabase
    .from('plantao_remocoes')
    .insert({
      plantao_id: plantao.id,
      usuario_id: membro.usuario_id,
      removido_por: porId,
      era_coordenador: ehVagaDeCoordenador(plantao.data, membro.posicao),
      posicao: membro.posicao,
    })

  if (logError) throw new Error(`Médico removido, mas o histórico não foi gravado: ${logError.message}`)
}

// Conta desativada sai de tudo o que ainda não começou: vagas, trocas por horas que ia cobrir e pedidos
// pendentes (de troca e de vaga livre). Turno já começado ou passado fica como está: é o que aconteceu e conta no BM.
// Devolve quantos itens de cada tipo foram liberados
async function liberarEscalasFuturas(usuarioId, porId) {
  const hoje = horaLocal().slice(0, 10)
  const agora = new Date().toISOString()

  const { data: vagas, error: vagasError } = await supabase
    .from('plantao_usuarios')
    .select('id, usuario_id, posicao, plantoes!inner(id, data)')
    .eq('usuario_id', usuarioId)
    .gte('plantoes.data', hoje)

  if (vagasError) throw vagasError
  const vagasFuturas = vagas.filter(v => !turnoJaComecou(v.plantoes.data, v.posicao))

  // Mesmo efeito do esvaziarVaga, em lote (um médico pode ter dezenas de vagas na escala)
  if (vagasFuturas.length > 0) {
    const { error } = await supabase
      .from('plantao_usuarios')
      .delete()
      .in('id', vagasFuturas.map(v => v.id))
    if (error) throw error

    const ehVagaLiberada = t => vagasFuturas.some(v => v.plantoes.id === t.plantao_id && v.posicao === t.posicao)
    const { data: trocasDasVagas, error: trocasDasVagasError } = await supabase
      .from('plantao_trocas')
      .select('id, plantao_id, posicao')
      .eq('usuario_saida', usuarioId)
      .in('plantao_id', [...new Set(vagasFuturas.map(v => v.plantoes.id))])
      .or('status.eq.pendente,and(status.eq.aceita,hora_inicio.not.is.null)')
    if (trocasDasVagasError) throw trocasDasVagasError

    const idsTrocas = trocasDasVagas.filter(ehVagaLiberada).map(t => t.id)
    if (idsTrocas.length > 0) {
      const { error: cancelarError } = await supabase
        .from('plantao_trocas')
        .update({ status: 'cancelada', respondido_em: agora })
        .in('id', idsTrocas)
      if (cancelarError) throw cancelarError
    }

    const { error: logError } = await supabase
      .from('plantao_remocoes')
      .insert(vagasFuturas.map(v => ({
        plantao_id: v.plantoes.id,
        usuario_id: usuarioId,
        removido_por: porId,
        era_coordenador: ehVagaDeCoordenador(v.plantoes.data, v.posicao),
        posicao: v.posicao,
      })))
    if (logError) throw new Error(`Vagas liberadas, mas o histórico não foi gravado: ${logError.message}`)
  }

  const { data: coberturas, error: coberturasError } = await supabase
    .from('plantao_trocas')
    .select('id, posicao, plantoes!inner(data)')
    .eq('usuario_entrada', usuarioId)
    .eq('status', 'aceita')
    .not('hora_inicio', 'is', null)
    .gte('plantoes.data', hoje)

  if (coberturasError) throw coberturasError
  const coberturasFuturas = coberturas.filter(c => !turnoJaComecou(c.plantoes.data, c.posicao)).map(c => c.id)
  if (coberturasFuturas.length > 0) {
    const { error } = await supabase
      .from('plantao_trocas')
      .update({ status: 'cancelada', respondido_em: agora })
      .in('id', coberturasFuturas)
    if (error) throw error
  }

  // Pedidos de troca em que ele sai ou entra (os que ele pediu como gestão, entre outros médicos, continuam)
  const { data: trocas, error: trocasError } = await supabase
    .from('plantao_trocas')
    .update({ status: 'cancelada', respondido_em: agora })
    .eq('status', 'pendente')
    .or(`usuario_entrada.eq.${usuarioId},usuario_saida.eq.${usuarioId}`)
    .select('id')

  if (trocasError) throw trocasError

  const { data: pedidos, error: pedidosError } = await supabase
    .from('plantao_pedidos_vaga')
    .update({ status: 'cancelado', respondido_por: porId, respondido_em: agora })
    .eq('status', 'pendente')
    .eq('usuario_id', usuarioId)
    .select('id')

  if (pedidosError) throw pedidosError

  return {
    vagas: vagasFuturas.length,
    coberturas: coberturasFuturas.length,
    pedidosTroca: trocas.length,
    pedidosVaga: pedidos.length,
  }
}

module.exports = { esvaziarVaga, liberarEscalasFuturas }
