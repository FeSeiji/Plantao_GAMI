// Quem precisa aceitar a troca: o titular, quando o próprio substituto pediu a vaga;
// nos demais casos (o titular ou a gestão pediram), o substituto
function respondenteDaTroca(troca) {
  return troca.solicitado_por === troca.usuario_entrada ? troca.usuario_saida : troca.usuario_entrada
}

module.exports = { respondenteDaTroca }
