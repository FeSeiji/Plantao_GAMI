const { TURNOS, vagasQueSobem, turnoDaPosicao, turnoJaComecou } = require('./posicoes')

// Subida de escala (Dra. Aline, 28/10/2026): o titular de férias aprovadas continua na vaga, recebendo os pontos
// dela. Se o turno começa sem ninguém cobrindo as férias, a escala sobe sozinha: quem está abaixo dele, nas posições
// numeradas do mesmo turno (vagasQueSobem), passa a valer uma posição acima. Ninguém muda de vaga no banco: a subida
// é calculada a cada leitura, e some sozinha se alguém cobrir as férias depois ou se as férias forem removidas.

function deFerias(afastamentos, usuarioId, data) {
  return afastamentos.some(a =>
    a.usuario_id === usuarioId && a.tipo === 'ferias' && a.status === 'aprovado' && a.data_inicio <= data && a.data_fim >= data
  )
}

// As vagas do plantão em que a escala subiu. membros: [{ usuario_id, posicao }]; afastamentos: os dos membros
// (só as férias aprovadas contam); coberta(posicao): a vaga tem troca por horas ou cobertura de férias valendo
function vagasQueSubiram(plantao, membros, afastamentos, coberta, agora = new Date()) {
  return new Set(
    membros
      .filter(m =>
        m.posicao != null &&
        vagasQueSobem(plantao.data, turnoDaPosicao(m.posicao)).includes(m.posicao) &&
        deFerias(afastamentos, m.usuario_id, plantao.data) &&
        !coberta(m.posicao) &&
        turnoJaComecou(plantao.data, m.posicao, agora)
      )
      .map(m => m.posicao)
  )
}

// Map posicao -> a posição que a vaga vale com a escala subida, só para as que mudam. subiram: vagasQueSubiram.
// Na escada do turno, cada vaga sobe tantas posições quantas vagas subidas houver acima dela: com o 3º de férias,
// o 4º vale como 3º, o 5º como 4º...
function posicoesEfetivas(plantao, subiram) {
  const efetivas = new Map()
  if (subiram.size === 0) return efetivas
  for (const turno of Object.keys(TURNOS)) {
    const escada = vagasQueSobem(plantao.data, turno)
    escada.forEach((posicao, i) => {
      if (subiram.has(posicao)) return
      const acima = escada.slice(0, i).filter(p => subiram.has(p)).length
      if (acima > 0) efetivas.set(posicao, escada[i - acima])
    })
  }
  return efetivas
}

module.exports = { vagasQueSubiram, posicoesEfetivas }
