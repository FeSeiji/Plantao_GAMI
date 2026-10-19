// Vagas do plantão, no formato da escala anual do cliente: um plantão por dia, com o diurno (07h–19h)
// e o noturno (19h–07h do dia seguinte). A posição gravada em plantao_usuarios identifica a vaga e segue
// a ordem das linhas da escala, de 1 a 13 — por isso o mesmo médico pode estar no diurno e no noturno.
// No sábado e no domingo (pela data do plantão) algumas vagas mudam: veja fimDeSemana abaixo.
// Mesma tabela em Frontend/components/posicoes.ts.
const TURNOS = {
  diurno: { hora_inicio: '07:00', hora_fim: '19:00' },
  noturno: { hora_inicio: '19:00', hora_fim: '07:00' },
}

// pontos: o que a vaga vale para o sócio no BM (o mesmo no fim de semana)
// fimDeSemana: false quando a vaga não existe no sábado e no domingo; um objeto quando muda o horário.
// Os nomes do fim de semana (Manhã, 1º–4º) ficam só no frontend.
const VAGAS = [
  { posicao: 1, turno: 'diurno', coordenador: true, pontos: 7 }, // Coordenador
  { posicao: 2, turno: 'diurno', coordenador: true, pontos: 7 }, // Coordenador
  { posicao: 3, turno: 'diurno', pontos: 6, fimDeSemana: { hora_fim: '13:00' } }, // 2º; Manhã no fim de semana
  { posicao: 4, turno: 'diurno', pontos: 5 }, // 3º; 1º no fim de semana
  { posicao: 5, turno: 'diurno', pontos: 4 }, // 4º; 2º no fim de semana
  { posicao: 6, turno: 'diurno', pontos: 3 }, // 5º; 3º no fim de semana
  { posicao: 7, turno: 'diurno', pontos: 2 }, // 6º; 4º no fim de semana
  { posicao: 8, turno: 'diurno', pontos: 1, fimDeSemana: false }, // 7º
  { posicao: 9, turno: 'noturno', pontos: 7 }, // Intermediário
  { posicao: 10, turno: 'noturno', pontos: 7 }, // 1º
  { posicao: 11, turno: 'noturno', pontos: 7 }, // 1º; 2º no fim de semana
  { posicao: 12, turno: 'noturno', pontos: 6 }, // 2º; 3º no fim de semana
  { posicao: 13, turno: 'noturno', pontos: 5 }, // 3º; 4º no fim de semana
]

const POSICOES = VAGAS.map(v => v.posicao)

function vagaDa(posicao) {
  return VAGAS.find(v => v.posicao === posicao) ?? null
}

// Sábado ou domingo. Vale a data do plantão: o noturno de domingo para segunda é de fim de semana, o de sexta não
function ehFimDeSemana(data) {
  const [ano, mes, dia] = data.split('-').map(Number)
  const diaDaSemana = new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay()
  return diaDaSemana === 0 || diaDaSemana === 6
}

// A vaga existe no plantão desse dia? (a 8 não existe no fim de semana)
function vagaExisteNoDia(data, posicao) {
  const vaga = vagaDa(posicao)
  return vaga != null && !(ehFimDeSemana(data) && vaga.fimDeSemana === false)
}

function ehVagaDeCoordenador(posicao) {
  return vagaDa(posicao)?.coordenador === true
}

function turnoDaPosicao(posicao) {
  return vagaDa(posicao)?.turno ?? null
}

// Horário da vaga nesse plantão: { data, hora_inicio, hora_fim } — o do turno dela, ou o próprio no fim de semana
// (a manhã vai das 07h às 13h)
function horarioDaVaga(plantao, posicao) {
  const vaga = vagaDa(posicao)
  const proprio = ehFimDeSemana(plantao.data) && vaga.fimDeSemana ? vaga.fimDeSemana : {}
  return { data: plantao.data, ...TURNOS[vaga.turno], ...proprio }
}

function pontosDaPosicao(posicao) {
  return vagaDa(posicao)?.pontos ?? 0
}

// Instante no horário de Brasília (o do hospital), não no do servidor: "2026-10-18 14:05"
function horaLocal(instante = new Date()) {
  return instante.toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 16)
}

// O horário da vaga já começou nesse plantão?
function turnoJaComecou(data, posicao, agora = new Date()) {
  return `${data} ${horarioDaVaga({ data }, posicao).hora_inicio}` <= horaLocal(agora)
}

// Fim do horário da vaga, no mesmo formato de horaLocal. O noturno termina no dia seguinte
function fimDoTurno(data, posicao) {
  const { hora_inicio, hora_fim } = horarioDaVaga({ data }, posicao)
  if (hora_fim > hora_inicio) return `${data} ${hora_fim}`
  const [ano, mes, dia] = data.split('-').map(Number)
  const amanha = new Date(Date.UTC(ano, mes - 1, dia + 1)).toISOString().slice(0, 10)
  return `${amanha} ${hora_fim}`
}

function turnoJaTerminou(data, posicao, agora = new Date()) {
  return fimDoTurno(data, posicao) <= horaLocal(agora)
}

module.exports = {
  horaLocal,
  turnoJaComecou,
  fimDoTurno,
  turnoJaTerminou,
  TURNOS,
  POSICOES,
  ehFimDeSemana,
  vagaExisteNoDia,
  ehVagaDeCoordenador,
  turnoDaPosicao,
  horarioDaVaga,
  pontosDaPosicao,
}
