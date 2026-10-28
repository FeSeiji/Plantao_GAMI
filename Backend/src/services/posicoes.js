// Vagas do plantão, no formato da escala anual do cliente: um plantão por dia, com o diurno (07h–19h)
// e o noturno (19h–07h do dia seguinte). A posição gravada em plantao_usuarios identifica a vaga e segue
// a ordem das linhas da escala, de 1 a 13 — por isso o mesmo médico pode estar no diurno e no noturno.
// No sábado e no domingo (pela data do plantão) algumas vagas mudam: veja fimDeSemana abaixo.
// Mesma tabela em Frontend/components/posicoes.ts.
const TURNOS = {
  diurno: { hora_inicio: '07:00', hora_fim: '19:00' },
  noturno: { hora_inicio: '19:00', hora_fim: '07:00' },
}

// fimDeSemana: false quando a vaga não existe no sábado e no domingo; um objeto com o que muda (nome, horário,
// se é de coordenador). rotulo: o nome da vaga na escala (o BM dos sócios Jr e o Excel usam).
// sobe: posição numerada, que entra na subida de escala (services/subidas.js). Coordenadores (o 1º do noturno
// também é coordenador para o cliente), plantonista, intermediário e manhã ficam de fora
const VAGAS = [
  { posicao: 1, turno: 'diurno', rotulo: 'Coordenador', coordenador: true, fimDeSemana: { rotulo: 'Plantonista', coordenador: false } },
  { posicao: 2, turno: 'diurno', rotulo: 'Coordenador', coordenador: true },
  { posicao: 3, turno: 'diurno', rotulo: '2º', sobe: true, fimDeSemana: { rotulo: 'Manhã', hora_fim: '13:00', sobe: false } },
  { posicao: 4, turno: 'diurno', rotulo: '3º', sobe: true, fimDeSemana: { rotulo: '2º' } },
  { posicao: 5, turno: 'diurno', rotulo: '4º', sobe: true, fimDeSemana: { rotulo: '3º' } },
  { posicao: 6, turno: 'diurno', rotulo: '5º', sobe: true, fimDeSemana: { rotulo: '4º' } },
  { posicao: 7, turno: 'diurno', rotulo: '6º', sobe: true, fimDeSemana: { rotulo: '5º' } },
  { posicao: 8, turno: 'diurno', rotulo: '7º', sobe: true, fimDeSemana: false },
  { posicao: 9, turno: 'noturno', rotulo: 'Intermediário', fimDeSemana: { rotulo: 'Plantonista' } },
  { posicao: 10, turno: 'noturno', rotulo: '1º' },
  { posicao: 11, turno: 'noturno', rotulo: '1º', fimDeSemana: { rotulo: '2º', sobe: true } },
  { posicao: 12, turno: 'noturno', rotulo: '2º', sobe: true, fimDeSemana: { rotulo: '3º' } },
  { posicao: 13, turno: 'noturno', rotulo: '3º', sobe: true, fimDeSemana: { rotulo: '4º' } },
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

// A vaga como ela é nesse dia (com o que muda no fim de semana)
function vagaNoDia(data, posicao) {
  const vaga = vagaDa(posicao)
  if (!vaga?.fimDeSemana || !ehFimDeSemana(data)) return vaga
  return { ...vaga, ...vaga.fimDeSemana }
}

// A vaga 1 é de coordenador só de segunda a sexta: no fim de semana ela é a do plantonista
function ehVagaDeCoordenador(data, posicao) {
  return vagaNoDia(data, posicao)?.coordenador === true
}

// As posições numeradas do turno nesse dia, de cima para baixo: a escada da subida de escala
function vagasQueSobem(data, turno) {
  return VAGAS.filter(v => v.turno === turno && vagaExisteNoDia(data, v.posicao) && vagaNoDia(data, v.posicao).sobe === true)
    .map(v => v.posicao)
}

// "Coordenador" / "3º" / "Manhã" / "Plantonista": o nome da vaga nesse dia
function rotuloDaVaga(data, posicao) {
  return vagaNoDia(data, posicao)?.rotulo ?? `Vaga ${posicao}`
}

function turnoDaPosicao(posicao) {
  return vagaDa(posicao)?.turno ?? null
}

// Horário da vaga nesse plantão: { data, hora_inicio, hora_fim } — o do turno dela, ou o próprio no fim de semana
// (a manhã vai das 07h às 13h)
function horarioDaVaga(plantao, posicao) {
  const vaga = vagaNoDia(plantao.data, posicao)
  const turno = TURNOS[vaga.turno]
  return { data: plantao.data, hora_inicio: vaga.hora_inicio ?? turno.hora_inicio, hora_fim: vaga.hora_fim ?? turno.hora_fim }
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
  rotuloDaVaga,
  vagasQueSobem,
}
