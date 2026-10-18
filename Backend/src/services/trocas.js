const { fimDoTurno, horaLocal } = require('./posicoes')

// Quem precisa aceitar a troca: o titular, quando o próprio substituto pediu a vaga;
// nos demais casos (o titular ou a gestão pediram), o substituto
function respondenteDaTroca(troca) {
  return troca.solicitado_por === troca.usuario_entrada ? troca.usuario_saida : troca.usuario_entrada
}

// Pedido feito antes do fim do turno e não respondido até lá: venceu. Depois do fim só a gestão
// cria troca (registro do que aconteceu), e esse pedido continua valendo
function trocaVencida(troca, data) {
  if (!data) return false
  const fim = fimDoTurno(data, troca.posicao)
  return fim <= horaLocal() && horaLocal(new Date(troca.solicitado_em)) < fim
}

module.exports = { respondenteDaTroca, trocaVencida }
