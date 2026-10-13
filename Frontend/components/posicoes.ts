// Vagas de cada plantão — mesma regra de Backend/src/services/posicoes.js, no formato da escala anual do cliente.
// Sócio diurno: posições 1 a 7 e, no fim, o intermediário (gravado como posição 8).
// Sócio noturno (começa às 19h ou depois): 1º, 1º, 2º, 3º e o intermediário — o segundo 1º é gravado como 9.
// Plantonista: Coordenador, Coordenador, 2º a 7º — o segundo coordenador também é gravado como 9.
export type TipoPlantao = "plantonista" | "socio"

export const POSICAO_INTERMEDIARIO = 8
export const POSICAO_SEGUNDO_PRIMEIRO = 9
export const POSICOES = [1, 2, 3, 4, 5, 6, 7, POSICAO_INTERMEDIARIO]
export const POSICOES_NOTURNO = [1, POSICAO_SEGUNDO_PRIMEIRO, 2, 3, POSICAO_INTERMEDIARIO]
export const POSICOES_PLANTONISTA = [1, POSICAO_SEGUNDO_PRIMEIRO, 2, 3, 4, 5, 6, 7]
// No plantonista, as duas primeiras vagas são as de coordenador
const POSICOES_COORDENADOR = [1, POSICAO_SEGUNDO_PRIMEIRO]

const HORA_INICIO_NOTURNO = 19

export function ehNoturno(horaInicio: string) {
  return Number(horaInicio.slice(0, 2)) >= HORA_INICIO_NOTURNO
}

export function posicoesDoPlantao(tipo: TipoPlantao, horaInicio: string) {
  if (tipo === "plantonista") return POSICOES_PLANTONISTA
  return ehNoturno(horaInicio) ? POSICOES_NOTURNO : POSICOES
}

export function ehPosicaoDeCoordenador(tipo: TipoPlantao, posicao: number | null | undefined) {
  return tipo === "plantonista" && posicao != null && POSICOES_COORDENADOR.includes(posicao)
}

// Para ordenar a fila: o segundo 1º vem logo depois do primeiro
export function ordemDaPosicao(posicao: number) {
  return posicao === POSICAO_SEGUNDO_PRIMEIRO ? 1.5 : posicao
}

// "3º" / "Intermediário" / "Coordenador" — cabeçalhos e células
export function rotuloPosicao(posicao: number, tipo: TipoPlantao = "socio") {
  if (ehPosicaoDeCoordenador(tipo, posicao)) return "Coordenador"
  if (posicao === POSICAO_INTERMEDIARIO) return "Intermediário"
  if (posicao === POSICAO_SEGUNDO_PRIMEIRO) return "1º"
  return `${posicao}º`
}

// "3" / "Int" / "C" — espaços apertados (select, marcador do calendário)
export function rotuloPosicaoCurto(posicao: number, tipo: TipoPlantao = "socio") {
  if (ehPosicaoDeCoordenador(tipo, posicao)) return "C"
  if (posicao === POSICAO_INTERMEDIARIO) return "Int"
  if (posicao === POSICAO_SEGUNDO_PRIMEIRO) return "1"
  return String(posicao)
}

// "posição 3" / "intermediário" / "coordenador" — no meio de frases
export function descreverPosicao(posicao: number, tipo: TipoPlantao = "socio") {
  if (ehPosicaoDeCoordenador(tipo, posicao)) return "coordenador"
  if (posicao === POSICAO_INTERMEDIARIO) return "intermediário"
  if (posicao === POSICAO_SEGUNDO_PRIMEIRO) return "posição 1"
  return `posição ${posicao}`
}
