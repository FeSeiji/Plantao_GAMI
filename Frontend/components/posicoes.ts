// Fila do plantão de sócio — mesma regra de Backend/src/services/posicoes.js.
// Diurno: posições 1 a 7 e, no fim, o intermediário (gravado como posição 8).
// Noturno (começa às 19h ou depois): 1º, 1º, 2º, 3º, 4º — o segundo 1º é gravado como 9.
export const POSICAO_INTERMEDIARIO = 8
export const POSICAO_SEGUNDO_PRIMEIRO = 9
export const POSICOES = [1, 2, 3, 4, 5, 6, 7, POSICAO_INTERMEDIARIO]
export const POSICOES_NOTURNO = [1, POSICAO_SEGUNDO_PRIMEIRO, 2, 3, 4]

const HORA_INICIO_NOTURNO = 19

export function ehNoturno(horaInicio: string) {
  return Number(horaInicio.slice(0, 2)) >= HORA_INICIO_NOTURNO
}

export function posicoesDoPlantao(horaInicio: string) {
  return ehNoturno(horaInicio) ? POSICOES_NOTURNO : POSICOES
}

// Para ordenar a fila: o segundo 1º vem logo depois do primeiro
export function ordemDaPosicao(posicao: number) {
  return posicao === POSICAO_SEGUNDO_PRIMEIRO ? 1.5 : posicao
}

// "3º" / "Intermediário" — cabeçalhos e células
export function rotuloPosicao(posicao: number) {
  if (posicao === POSICAO_INTERMEDIARIO) return "Intermediário"
  if (posicao === POSICAO_SEGUNDO_PRIMEIRO) return "1º"
  return `${posicao}º`
}

// "3" / "Int" — espaços apertados (select, marcador do calendário)
export function rotuloPosicaoCurto(posicao: number) {
  if (posicao === POSICAO_INTERMEDIARIO) return "Int"
  if (posicao === POSICAO_SEGUNDO_PRIMEIRO) return "1"
  return String(posicao)
}

// "posição 3" / "intermediário" — no meio de frases
export function descreverPosicao(posicao: number) {
  if (posicao === POSICAO_INTERMEDIARIO) return "intermediário"
  if (posicao === POSICAO_SEGUNDO_PRIMEIRO) return "posição 1"
  return `posição ${posicao}`
}
