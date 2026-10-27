// Vagas do plantão — mesma tabela de Backend/src/services/posicoes.js, no formato da escala anual do cliente.
// Um plantão por dia, com o diurno (07h–19h) e o noturno (19h–07h do dia seguinte). A posição identifica a vaga
// e segue a ordem das linhas da escala, de 1 a 13 — por isso o mesmo médico pode estar no diurno e no noturno.
// No sábado e no domingo (pela data do plantão) algumas vagas mudam de nome ou de horário, e a do 7º não existe:
// o diurno fica Plantonista, Coordenador, Manhã e 2º a 5º, e o noturno Plantonista e 1º a 4º.
export type Turno = "diurno" | "noturno"

export const TURNOS: { valor: Turno; rotulo: string; hora_inicio: string; hora_fim: string }[] = [
  { valor: "diurno", rotulo: "Diurno", hora_inicio: "07:00", hora_fim: "19:00" },
  { valor: "noturno", rotulo: "Noturno", hora_inicio: "19:00", hora_fim: "07:00" },
]

type Nome = { rotulo: string; curto: string; abrev?: string; frase?: string }
type Vaga = Nome & {
  posicao: number
  turno: Turno
  coordenador?: boolean
  // Sábado e domingo: false quando a vaga não existe; senão, o que muda (nome, horário, se é de coordenador)
  fimDeSemana?: false | (Partial<Nome> & { coordenador?: boolean; hora_inicio?: string; hora_fim?: string })
}

// frase: como a vaga aparece no meio de uma frase, quando não é "3º do diurno"
const VAGAS: Vaga[] = [
  {
    posicao: 1, turno: "diurno", rotulo: "Coordenador", curto: "C", abrev: "Coord.", frase: "coordenador", coordenador: true,
    fimDeSemana: { rotulo: "Plantonista", curto: "P", abrev: "Plant.", frase: "plantonista do diurno", coordenador: false },
  },
  { posicao: 2, turno: "diurno", rotulo: "Coordenador", curto: "C", abrev: "Coord.", frase: "coordenador", coordenador: true },
  {
    posicao: 3, turno: "diurno", rotulo: "2º", curto: "2",
    fimDeSemana: { rotulo: "Manhã", curto: "M", frase: "manhã", hora_fim: "13:00" },
  },
  { posicao: 4, turno: "diurno", rotulo: "3º", curto: "3", fimDeSemana: { rotulo: "2º", curto: "2" } },
  { posicao: 5, turno: "diurno", rotulo: "4º", curto: "4", fimDeSemana: { rotulo: "3º", curto: "3" } },
  { posicao: 6, turno: "diurno", rotulo: "5º", curto: "5", fimDeSemana: { rotulo: "4º", curto: "4" } },
  { posicao: 7, turno: "diurno", rotulo: "6º", curto: "6", fimDeSemana: { rotulo: "5º", curto: "5" } },
  { posicao: 8, turno: "diurno", rotulo: "7º", curto: "7", fimDeSemana: false },
  {
    posicao: 9, turno: "noturno", rotulo: "Intermediário", curto: "Int", abrev: "Interm.", frase: "intermediário",
    fimDeSemana: { rotulo: "Plantonista", curto: "P", abrev: "Plant.", frase: "plantonista do noturno" },
  },
  { posicao: 10, turno: "noturno", rotulo: "1º", curto: "1" },
  { posicao: 11, turno: "noturno", rotulo: "1º", curto: "1", fimDeSemana: { rotulo: "2º", curto: "2" } },
  { posicao: 12, turno: "noturno", rotulo: "2º", curto: "2", fimDeSemana: { rotulo: "3º", curto: "3" } },
  { posicao: 13, turno: "noturno", rotulo: "3º", curto: "3", fimDeSemana: { rotulo: "4º", curto: "4" } },
]

// Sábado ou domingo. Vale a data do plantão: o noturno de domingo para segunda é de fim de semana, o de sexta não
export function ehFimDeSemana(data: string) {
  const [ano, mes, dia] = data.split("-").map(Number)
  const diaDaSemana = new Date(ano, mes - 1, dia).getDay()
  return diaDaSemana === 0 || diaDaSemana === 6
}

type VagaNoDia = Omit<Vaga, "fimDeSemana"> & { hora_inicio?: string; hora_fim?: string }

// A vaga como ela é nesse dia (com o nome e o horário do fim de semana, se for o caso)
function vagaDa(data: string, posicao: number): VagaNoDia | undefined {
  const vaga = VAGAS.find((v) => v.posicao === posicao)
  if (!vaga?.fimDeSemana || !ehFimDeSemana(data)) return vaga
  return { ...vaga, abrev: undefined, ...vaga.fimDeSemana }
}

function existeNoDia(data: string, vaga: Vaga) {
  return !(vaga.fimDeSemana === false && ehFimDeSemana(data))
}

// As vagas do turno nesse dia, na ordem da escala (no fim de semana o diurno não tem o 7º).
// ocupadas: vagas com alguém que entram mesmo sem existir no dia (o 7º de um plantão que passou para o
// fim de semana), para o médico continuar aparecendo e poder ser movido ou removido
export function vagasDoTurno(turno: Turno, data: string, ocupadas: number[] = []) {
  return VAGAS.filter((v) => v.turno === turno && (existeNoDia(data, v) || ocupadas.includes(v.posicao))).map(
    (v) => v.posicao,
  )
}

// Todas as linhas da escala no turno, com o nome do dia de semana — a grade do Meu plantão, como no PDF do cliente
export function linhasDoTurno(turno: Turno) {
  return VAGAS.filter((v) => v.turno === turno).map(({ posicao, rotulo, curto }) => ({ posicao, rotulo, curto }))
}

// A vaga existe em algum dia da semana, mas não nesse (o 7º no fim de semana)
export function vagaNaoExisteNoDia(data: string, posicao: number) {
  const vaga = VAGAS.find((v) => v.posicao === posicao)
  return vaga != null && !existeNoDia(data, vaga)
}

export function turnoDaPosicao(posicao: number): Turno {
  return VAGAS.find((v) => v.posicao === posicao)?.turno ?? "diurno"
}

export function rotuloTurno(turno: Turno) {
  return TURNOS.find((t) => t.valor === turno)!.rotulo
}

// { data, hora_inicio, hora_fim } da vaga nesse dia — o horário do turno dela, ou o próprio no fim de semana
// (a manhã vai das 7h às 13h)
export function horarioDaVaga(data: string, posicao: number) {
  const vaga = vagaDa(data, posicao)
  const turno = TURNOS.find((t) => t.valor === turnoDaPosicao(posicao))!
  return {
    data,
    hora_inicio: vaga?.hora_inicio ?? turno.hora_inicio,
    hora_fim: vaga?.hora_fim ?? turno.hora_fim,
  }
}

// A vaga 1 é de coordenador só de segunda a sexta: no fim de semana ela é a do plantonista
export function ehVagaDeCoordenador(data: string, posicao: number | null | undefined) {
  return posicao != null && vagaDa(data, posicao)?.coordenador === true
}

// "Coordenador" / "3º" / "Intermediário" / "Manhã" / "Plantonista" — cabeçalhos e células (o turno aparece no título do bloco)
export function rotuloPosicao(data: string, posicao: number) {
  return vagaDa(data, posicao)?.rotulo ?? `${posicao}`
}

// "Coord." / "3º" / "Interm." — coluna da vaga na lista do plantão e no select de posição
export function rotuloPosicaoAbreviado(data: string, posicao: number) {
  const vaga = vagaDa(data, posicao)
  return vaga?.abrev ?? vaga?.rotulo ?? `${posicao}`
}

// "C" / "3" / "Int" / "M" — espaços apertados (marcador do calendário)
export function rotuloPosicaoCurto(data: string, posicao: number) {
  return vagaDa(data, posicao)?.curto ?? String(posicao)
}

// "coordenador" / "3º do diurno" / "intermediário" / "manhã" / "plantonista do diurno" — no meio de frases
export function descreverPosicao(data: string, posicao: number) {
  const vaga = vagaDa(data, posicao)
  if (!vaga) return `vaga ${posicao}`
  return vaga.frase ?? `${vaga.rotulo} do ${vaga.turno}`
}

function formatarHoras(horaInicio: string, horaFim: string) {
  return `${Number(horaInicio.slice(0, 2))}h–${Number(horaFim.slice(0, 2))}h`
}

// "7h–19h"
export function formatarTurno(turno: Turno) {
  const { hora_inicio, hora_fim } = TURNOS.find((t) => t.valor === turno)!
  return formatarHoras(hora_inicio, hora_fim)
}

// "7h–19h", ou "7h–19h · manhã 7h–13h" no fim de semana: o turno e as vagas com horário próprio nesse dia
export function formatarTurnoDoDia(turno: Turno, data: string) {
  const proprios = vagasDoTurno(turno, data)
    .map((p) => vagaDa(data, p)!)
    .filter((v) => v.hora_inicio || v.hora_fim)
    .map((v) => {
      const { hora_inicio, hora_fim } = horarioDaVaga(data, v.posicao)
      return `${v.frase ?? v.rotulo} ${formatarHoras(hora_inicio, hora_fim)}`
    })
  return [formatarTurno(turno), ...proprios].join(" · ")
}
