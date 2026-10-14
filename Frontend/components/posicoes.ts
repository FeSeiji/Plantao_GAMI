// Vagas do plantão — mesma tabela de Backend/src/services/posicoes.js, no formato da escala anual do cliente.
// Um plantão por dia, com o diurno (07h–19h) e o noturno (19h–07h do dia seguinte). A posição identifica a vaga
// e segue a ordem das linhas da escala, de 1 a 13 — por isso o mesmo médico pode estar no diurno e no noturno.
export type Turno = "diurno" | "noturno"

export const TURNOS: { valor: Turno; rotulo: string; hora_inicio: string; hora_fim: string }[] = [
  { valor: "diurno", rotulo: "Diurno", hora_inicio: "07:00", hora_fim: "19:00" },
  { valor: "noturno", rotulo: "Noturno", hora_inicio: "19:00", hora_fim: "07:00" },
]

type Vaga = { posicao: number; turno: Turno; rotulo: string; curto: string; coordenador?: boolean }

export const VAGAS: Vaga[] = [
  { posicao: 1, turno: "diurno", rotulo: "Coordenador", curto: "C", coordenador: true },
  { posicao: 2, turno: "diurno", rotulo: "Coordenador", curto: "C", coordenador: true },
  { posicao: 3, turno: "diurno", rotulo: "2º", curto: "2" },
  { posicao: 4, turno: "diurno", rotulo: "3º", curto: "3" },
  { posicao: 5, turno: "diurno", rotulo: "4º", curto: "4" },
  { posicao: 6, turno: "diurno", rotulo: "5º", curto: "5" },
  { posicao: 7, turno: "diurno", rotulo: "6º", curto: "6" },
  { posicao: 8, turno: "diurno", rotulo: "7º", curto: "7" },
  { posicao: 9, turno: "noturno", rotulo: "Intermediário", curto: "Int" },
  { posicao: 10, turno: "noturno", rotulo: "1º", curto: "1" },
  { posicao: 11, turno: "noturno", rotulo: "1º", curto: "1" },
  { posicao: 12, turno: "noturno", rotulo: "2º", curto: "2" },
  { posicao: 13, turno: "noturno", rotulo: "3º", curto: "3" },
]

function vagaDa(posicao: number) {
  return VAGAS.find((v) => v.posicao === posicao)
}

export function vagasDoTurno(turno: Turno) {
  return VAGAS.filter((v) => v.turno === turno).map((v) => v.posicao)
}

export function turnoDaPosicao(posicao: number): Turno {
  return vagaDa(posicao)?.turno ?? "diurno"
}

export function rotuloTurno(turno: Turno) {
  return TURNOS.find((t) => t.valor === turno)!.rotulo
}

// { data, hora_inicio, hora_fim } da vaga nesse dia — o horário do turno dela
export function horarioDaVaga(data: string, posicao: number) {
  const { hora_inicio, hora_fim } = TURNOS.find((t) => t.valor === turnoDaPosicao(posicao))!
  return { data, hora_inicio, hora_fim }
}

export function ehVagaDeCoordenador(posicao: number | null | undefined) {
  return posicao != null && vagaDa(posicao)?.coordenador === true
}

// "Coordenador" / "3º" / "Intermediário" — cabeçalhos e células (o turno aparece no título do bloco)
export function rotuloPosicao(posicao: number) {
  return vagaDa(posicao)?.rotulo ?? `${posicao}`
}

// "C" / "3" / "Int" — espaços apertados (marcador do calendário)
export function rotuloPosicaoCurto(posicao: number) {
  return vagaDa(posicao)?.curto ?? String(posicao)
}

// "coordenador" / "3º do diurno" / "intermediário" — no meio de frases
export function descreverPosicao(posicao: number) {
  const vaga = vagaDa(posicao)
  if (!vaga) return `vaga ${posicao}`
  if (vaga.coordenador) return "coordenador"
  if (vaga.curto === "Int") return "intermediário"
  return `${vaga.rotulo} do ${vaga.turno}`
}

// "7h–19h"
export function formatarTurno(turno: Turno) {
  const { hora_inicio, hora_fim } = TURNOS.find((t) => t.valor === turno)!
  return `${Number(hora_inicio.slice(0, 2))}h–${Number(hora_fim.slice(0, 2))}h`
}
