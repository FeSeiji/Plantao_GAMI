// Fila do plantão de sócio: posições 1 a 7 e, no fim, o intermediário (gravado como posição 8)
export const POSICAO_INTERMEDIARIO = 8
export const POSICOES = [1, 2, 3, 4, 5, 6, 7, POSICAO_INTERMEDIARIO]

// "3º" / "Intermediário" — cabeçalhos e células
export function rotuloPosicao(posicao: number) {
  return posicao === POSICAO_INTERMEDIARIO ? "Intermediário" : `${posicao}º`
}

// "3" / "Int" — espaços apertados (select, marcador do calendário)
export function rotuloPosicaoCurto(posicao: number) {
  return posicao === POSICAO_INTERMEDIARIO ? "Int" : String(posicao)
}

// "posição 3" / "intermediário" — no meio de frases
export function descreverPosicao(posicao: number) {
  return posicao === POSICAO_INTERMEDIARIO ? "intermediário" : `posição ${posicao}`
}
