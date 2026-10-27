const { ehFimDeSemana, turnoDaPosicao } = require('./posicoes')

// Pontuação do BM, em todos os meses: o plantonista conta plantões por categoria (diurno, noturno e os dois de
// fim de semana) e o sócio soma pontos pela tabela do cliente de 19/10/2026

// Pontos do sócio por vaga (posições de posicoes.js). De segunda a sexta (o noturno de sexta tem exceções abaixo)
const PONTOS_SEMANA = {
  1: 20, 2: 20, // coordenadores
  3: 20, // 2º
  4: 18, 5: 16, 6: 14, 7: 12, // 3º a 6º
  8: 11, // 7º
  9: 12, // intermediário
  10: 26, 11: 26, // as duas vagas de 1º do noturno ("coord noturno" para o cliente)
  12: 18, // 2º do noturno
  13: 8, // 3º do noturno
}

// Sábado e domingo (o noturno de domingo para segunda também): em geral a semana × 1,3.
// Valores confirmados pela Dra. Aline em 27/10/2026. As vagas de plantonista (1 e 9) contam quando um sócio cobre o
// plantonista: valem o mesmo que a vaga ocupava antes (no diurno, a de coordenador)
const PONTOS_FIM_DE_SEMANA = {
  1: 26, // plantonista do diurno: como coordenador
  2: 26, // coordenador
  3: 13, // manhã (7h–13h)
  4: 23.4, 5: 20.8, 6: 18.2, 7: 15.6, // 2º a 5º
  // 8: o 7º não existe no fim de semana; uma vaga que já estava ocupada vale como na semana
  9: 15.6, // plantonista do noturno: ficou 12 × 1,3 de quando era intermediário — confirmar com o cliente
  10: 33.8, 11: 23.4, 12: 10.4, 13: 7, // 1º ("coordenador" para o cliente) a 4º
}

// Sexta à noite: só o 2º e o 3º do noturno valem como no fim de semana
const PONTOS_SEXTA_NOITE = { 12: 23.4, 13: 10.4 }

// Categorias do plantonista no BM, na ordem das colunas
const CATEGORIAS = ['diurno', 'noturno', 'diurno_fds', 'noturno_fds']

function ehSexta(data) {
  const [ano, mes, dia] = data.split('-').map(Number)
  return new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay() === 5
}

const sextaANoite = (data, posicao) => ehSexta(data) && turnoDaPosicao(posicao) === 'noturno'

// Pontos que a vaga vale para o sócio no plantão desse dia (a vaga inteira; troca por horas e congresso rateiam depois)
function pontosDaVaga(data, posicao) {
  const semana = PONTOS_SEMANA[posicao] ?? 0
  if (ehFimDeSemana(data)) return PONTOS_FIM_DE_SEMANA[posicao] ?? semana
  if (sextaANoite(data, posicao)) return PONTOS_SEXTA_NOITE[posicao] ?? semana
  return semana
}

// Categoria do plantão do plantonista: o turno, "de fim de semana" no sábado, no domingo e na sexta à noite.
// A manhã do fim de semana conta como um diurno de fim de semana
function categoriaDaVaga(data, posicao) {
  const turno = turnoDaPosicao(posicao)
  return ehFimDeSemana(data) || sextaANoite(data, posicao) ? `${turno}_fds` : turno
}

const categoriasZeradas = () => Object.fromEntries(CATEGORIAS.map(c => [c, 0]))

// Contagens rateadas (troca por horas, congresso) ficam com duas casas
const duasCasas = n => Math.round(n * 100) / 100

module.exports = {
  CATEGORIAS,
  pontosDaVaga,
  categoriaDaVaga,
  categoriasZeradas,
  duasCasas,
}
