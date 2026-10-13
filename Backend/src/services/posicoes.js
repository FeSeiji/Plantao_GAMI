// Vagas de cada plantão, no formato da escala anual do cliente.
// Sócio diurno: posições 1 a 7 e o intermediário (gravado como 8).
// Sócio noturno (começa às 19h ou depois): 1º, 1º, 2º, 3º e o intermediário — o segundo 1º é gravado como 9,
// para cada vaga continuar única no banco e a troca de posição não ficar ambígua.
// Plantonista: Coordenador, Coordenador, 2º a 7º — o segundo coordenador também é gravado como 9.
const POSICAO_INTERMEDIARIO = 8
const POSICAO_SEGUNDO_PRIMEIRO = 9

const POSICOES_DIURNO = [1, 2, 3, 4, 5, 6, 7, POSICAO_INTERMEDIARIO]
const POSICOES_NOTURNO = [1, POSICAO_SEGUNDO_PRIMEIRO, 2, 3, POSICAO_INTERMEDIARIO]
const POSICOES_PLANTONISTA = [1, POSICAO_SEGUNDO_PRIMEIRO, 2, 3, 4, 5, 6, 7]
// No plantonista, as duas primeiras vagas são as de coordenador
const POSICOES_COORDENADOR = [1, POSICAO_SEGUNDO_PRIMEIRO]

const HORA_INICIO_NOTURNO = 19

function ehNoturno(horaInicio) {
  return Number(String(horaInicio).slice(0, 2)) >= HORA_INICIO_NOTURNO
}

function posicoesDoPlantao(tipo, horaInicio) {
  if (tipo === 'plantonista') return POSICOES_PLANTONISTA
  return ehNoturno(horaInicio) ? POSICOES_NOTURNO : POSICOES_DIURNO
}

function ehPosicaoDeCoordenador(tipo, posicao) {
  return tipo === 'plantonista' && POSICOES_COORDENADOR.includes(posicao)
}

// "3º" / "intermediário" / "coordenador" — mensagens de erro
function rotuloPosicao(posicao, tipo) {
  if (ehPosicaoDeCoordenador(tipo, posicao)) return 'coordenador'
  if (posicao === POSICAO_INTERMEDIARIO) return 'intermediário'
  if (posicao === POSICAO_SEGUNDO_PRIMEIRO) return 'segundo 1º'
  return `${posicao}º`
}

// Posição 1 vale 7 pontos, posição 7 vale 1; intermediário e segundo 1º do noturno valem 7.
// Só o plantão de sócio conta pontos — o de plantonista conta horas.
function pontosDaPosicao(posicao) {
  if (posicao == null) return 0
  if (posicao === POSICAO_INTERMEDIARIO || posicao === POSICAO_SEGUNDO_PRIMEIRO) return 7
  return 8 - posicao
}

// Para ordenar a fila: o segundo 1º (9) vem logo depois do primeiro
function ordemDaPosicao(posicao) {
  if (posicao == null) return 0
  return posicao === POSICAO_SEGUNDO_PRIMEIRO ? 1.5 : posicao
}

module.exports = {
  ehNoturno, posicoesDoPlantao, ehPosicaoDeCoordenador, rotuloPosicao, pontosDaPosicao, ordemDaPosicao,
}
