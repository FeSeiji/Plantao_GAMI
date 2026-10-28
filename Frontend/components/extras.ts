// Plantão extra (Backend/src/controllers/extras.js): um médico num horário livre de um dia, em paralelo ao plantão
// do dia e sem ligação com as vagas dele. Só a gestão cria, edita e exclui.
// tipo: como conta no BM, pelo cargo do médico — o sócio recebe os pontos da posição escolhida, proporcionais às
// horas; o plantonista e o sócio Jr contam as horas
export type PlantaoExtra = {
  id: string
  data: string
  hora_inicio: string
  hora_fim: string
  horas: number
  posicao: number | null
  observacao: string | null
  tipo: "socio" | "socio_jr" | "plantonista"
  medico: { id: string; nome?: string | null; email?: string | null; sigla?: string | null }
}

// "13:00" → "13h"; "13:30" → "13h30"
export function formatarHora(hora: string) {
  const [h, m] = hora.split(":")
  return `${Number(h)}h${m && m !== "00" ? m : ""}`
}

// "13h–19h"
export const formatarHorarioExtra = (e: Pick<PlantaoExtra, "hora_inicio" | "hora_fim">) =>
  `${formatarHora(e.hora_inicio)}–${formatarHora(e.hora_fim)}`

// Duração em horas; o fim antes do início passa da meia-noite
export function horasDoExtra(horaInicio: string, horaFim: string) {
  const minutos = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5))
  const diferenca = minutos(horaFim) - minutos(horaInicio)
  return (diferenca > 0 ? diferenca : diferenca + 24 * 60) / 60
}
