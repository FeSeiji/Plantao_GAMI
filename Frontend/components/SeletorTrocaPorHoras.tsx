"use client"

import { formatarIntervalo, horasIntermediarias } from "./trocaPorHoras"

export type LadoCobertura = "inicio" | "fim"

type Props = {
  // Horário do plantão ("19:00:00")
  horaInicio: string
  horaFim: string
  // null = troca do plantão inteiro; "inicio"/"fim" = o substituto cobre do começo até o corte, ou do corte até o fim
  lado: LadoCobertura | null
  corte: string
  nomeTitular: string
  onChange: (lado: LadoCobertura | null, corte: string) => void
}

const hora = (h: string) => `${Number(h.slice(0, 2))}h`

// Slider do plantão: o marcador é a hora em que a vaga se divide entre o titular e o substituto.
// A barra fica pintada de quem fica com cada parte; "Inverter" troca o lado que o substituto cobre.
export default function SeletorTrocaPorHoras({ horaInicio, horaFim, lado, corte, nomeTitular, onChange }: Props) {
  const intermediarias = horasIntermediarias(horaInicio, horaFim)
  if (intermediarias.length === 0) return null

  // Limites das horas: início, horas cheias do meio e fim
  const limites = [horaInicio.slice(0, 5), ...intermediarias, horaFim.slice(0, 5)]
  const total = limites.length - 1
  const metade = limites[Math.floor(total / 2)]
  const indiceCorte = Math.max(1, limites.indexOf(corte))

  // O slider vai do início ao fim do plantão, mas o corte não pode ficar nas pontas (seria o plantão inteiro)
  function moverCorte(indice: number) {
    if (!lado) return
    onChange(lado, limites[Math.min(total - 1, Math.max(1, indice))])
  }
  const percentualCorte = (indiceCorte / total) * 100

  // Com muitas horas, só metade dos rótulos cabe; início, fim e o corte sempre aparecem
  const mostraRotulo = (i: number) => total <= 12 || i % 2 === 0 || i === total || i === indiceCorte

  const modos = [
    { rotulo: "Plantão inteiro", ativo: lado === null, acao: () => onChange(null, "") },
    // Entra na metade final, o caso mais comum; a linha do tempo ajusta o resto
    { rotulo: "Por horas", ativo: lado !== null, acao: () => lado ?? onChange("fim", metade) },
  ]
  const atalhos = [
    { rotulo: "1ª metade", ativo: lado === "inicio" && corte === metade, acao: () => onChange("inicio", metade) },
    { rotulo: "2ª metade", ativo: lado === "fim" && corte === metade, acao: () => onChange("fim", metade) },
  ]

  const parteSubstituto = lado === "inicio" ? [limites[0], corte] : [corte, limites[total]]
  const parteTitular = lado === "inicio" ? [corte, limites[total]] : [limites[0], corte]

  return (
    <div className="mb-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
          {modos.map((m) => (
            <button
              key={m.rotulo}
              type="button"
              onClick={m.acao}
              className={`text-xs font-semibold px-2.5 py-1 rounded-md transition-colors ${
                m.ativo ? "bg-white text-brand-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {m.rotulo}
            </button>
          ))}
        </div>
        {lado && (
          <div className="flex items-center gap-1">
            {atalhos.map((a) => (
              <button
                key={a.rotulo}
                type="button"
                onClick={a.acao}
                className={`text-xs font-semibold px-2 py-1 rounded-md border transition-colors ${
                  a.ativo
                    ? "border-sky-300 bg-sky-50 text-sky-800"
                    : "border-gray-200 text-gray-500 hover:text-gray-700"
                }`}
              >
                {a.rotulo}
              </button>
            ))}
          </div>
        )}
      </div>

      {lado && (
        <>
          {/* A barra e os rótulos ficam recuados meio marcador (10px) para alinhar com o centro dele */}
          <div className="relative mt-4 h-5">
            <div className="absolute inset-x-[10px] top-1/2 -translate-y-1/2 h-2 rounded-full overflow-hidden flex">
              <div
                className={lado === "inicio" ? "bg-sky-400" : "bg-brand-700"}
                style={{ width: `${percentualCorte}%` }}
              />
              <div className={`flex-1 ${lado === "inicio" ? "bg-brand-700" : "bg-sky-400"}`} />
            </div>
            <input
              type="range"
              min={0}
              max={total}
              step={1}
              value={indiceCorte}
              onChange={(e) => moverCorte(Number(e.target.value))}
              aria-label="Hora em que a troca começa ou termina"
              aria-valuetext={hora(corte)}
              className="absolute inset-0 w-full h-5 appearance-none bg-transparent cursor-pointer focus:outline-none
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5
                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2
                [&::-webkit-slider-thumb]:border-brand-700 [&::-webkit-slider-thumb]:shadow-md
                [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:rounded-full
                [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-brand-700
                [&::-moz-range-thumb]:shadow-md [&::-moz-range-track]:bg-transparent
                focus-visible:[&::-webkit-slider-thumb]:ring-2 focus-visible:[&::-webkit-slider-thumb]:ring-brand-200"
            />
          </div>
          {/* Rótulos das horas, alinhados com as posições do marcador */}
          <div className="relative h-4 mt-1 mx-[10px]">
            {limites.map((h, i) =>
              mostraRotulo(i) ? (
                <span
                  key={i}
                  className={`absolute -translate-x-1/2 text-[10px] tabular-nums ${
                    i === indiceCorte ? "font-bold text-gray-800" : "text-gray-400"
                  }`}
                  style={{ left: `${(i / total) * 100}%` }}
                >
                  {Number(h.slice(0, 2))}
                </span>
              ) : null,
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 mt-1.5">
            <p className="text-xs text-gray-600">
              <span className="inline-block w-2 h-2 rounded-sm bg-sky-400 mr-1" />
              Substituto: <span className="font-semibold">{formatarIntervalo(parteSubstituto[0], parteSubstituto[1])}</span>
              <span className="mx-1.5 text-gray-300">·</span>
              <span className="inline-block w-2 h-2 rounded-sm bg-brand-700 mr-1" />
              {nomeTitular}: <span className="font-semibold">{formatarIntervalo(parteTitular[0], parteTitular[1])}</span>
            </p>
            <button
              type="button"
              onClick={() => onChange(lado === "inicio" ? "fim" : "inicio", corte)}
              className="text-xs font-semibold text-brand-700 hover:text-brand-800"
            >
              ⇄ Inverter
            </button>
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">Arraste o marcador para mudar onde a troca começa ou termina.</p>
        </>
      )}
    </div>
  )
}
