// Troca por horas: o convidado cobre só parte da vaga, encostada no início ou no fim do plantão.
// Mesmas regras de Backend/src/services/coberturas.js.

// "19h–23h" (minutos só aparecem se não forem :00)
export function formatarIntervalo(horaInicio: string, horaFim: string) {
  const hora = (h: string) => (h.slice(3, 5) === "00" ? `${Number(h.slice(0, 2))}h` : h.slice(0, 5))
  return `${hora(horaInicio)}–${hora(horaFim)}`
}

// Horas cheias estritamente dentro do plantão, na ordem do plantão (passando da meia-noite)
export function horasIntermediarias(horaInicio: string, horaFim: string): string[] {
  const ini = Number(horaInicio.slice(0, 2))
  const fimH = Number(horaFim.slice(0, 2))
  let total = (fimH - ini + 24) % 24
  if (total === 0) total = 24
  return Array.from({ length: total - 1 }, (_, i) => `${String((ini + i + 1) % 24).padStart(2, "0")}:00`)
}

// Dia em que a cobertura começa: o do plantão, ou o seguinte se ela começa depois da meia-noite
export function dataDaCobertura(plantao: { data: string; hora_inicio: string }, horaInicio: string) {
  if (horaInicio.slice(0, 5) >= plantao.hora_inicio.slice(0, 5)) return plantao.data
  const d = new Date(`${plantao.data}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

// 4,67 — pontos rateados pela troca por horas podem ter casas decimais
export function formatarPontos(pontos: number) {
  return pontos.toLocaleString("pt-BR", { maximumFractionDigits: 2 })
}
