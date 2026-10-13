// Vagas do plantão, no formato da escala anual do cliente: um plantão por dia, com o diurno (07h–19h)
// e o noturno (19h–07h do dia seguinte). A posição gravada em plantao_usuarios identifica a vaga e segue
// a ordem das linhas da escala, de 1 a 13 — por isso o mesmo médico pode estar no diurno e no noturno.
// Mesma tabela em Frontend/components/posicoes.ts.
const TURNOS = {
  diurno: { hora_inicio: '07:00', hora_fim: '19:00' },
  noturno: { hora_inicio: '19:00', hora_fim: '07:00' },
}

// pontos: o que a vaga vale para o sócio no BM
const VAGAS = [
  { posicao: 1, turno: 'diurno', coordenador: true, pontos: 7 }, // Coordenador
  { posicao: 2, turno: 'diurno', coordenador: true, pontos: 7 }, // Coordenador
  { posicao: 3, turno: 'diurno', pontos: 6 }, // 2º
  { posicao: 4, turno: 'diurno', pontos: 5 }, // 3º
  { posicao: 5, turno: 'diurno', pontos: 4 }, // 4º
  { posicao: 6, turno: 'diurno', pontos: 3 }, // 5º
  { posicao: 7, turno: 'diurno', pontos: 2 }, // 6º
  { posicao: 8, turno: 'diurno', pontos: 1 }, // 7º
  { posicao: 9, turno: 'noturno', pontos: 7 }, // Intermediário
  { posicao: 10, turno: 'noturno', pontos: 7 }, // 1º
  { posicao: 11, turno: 'noturno', pontos: 7 }, // 1º
  { posicao: 12, turno: 'noturno', pontos: 6 }, // 2º
  { posicao: 13, turno: 'noturno', pontos: 5 }, // 3º
]

const POSICOES = VAGAS.map(v => v.posicao)

function vagaDa(posicao) {
  return VAGAS.find(v => v.posicao === posicao) ?? null
}

function ehVagaDeCoordenador(posicao) {
  return vagaDa(posicao)?.coordenador === true
}

function turnoDaPosicao(posicao) {
  return vagaDa(posicao)?.turno ?? null
}

// Horário da vaga nesse plantão: { data, hora_inicio, hora_fim } do turno dela
function horarioDaVaga(plantao, posicao) {
  return { data: plantao.data, ...TURNOS[turnoDaPosicao(posicao)] }
}

function pontosDaPosicao(posicao) {
  return vagaDa(posicao)?.pontos ?? 0
}

module.exports = {
  TURNOS,
  POSICOES,
  ehVagaDeCoordenador,
  turnoDaPosicao,
  horarioDaVaga,
  pontosDaPosicao,
}
