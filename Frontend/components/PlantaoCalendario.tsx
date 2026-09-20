"use client"

type Plantao = {
  id: string
  titulo: string
  descricao: string | null
  data: string
  hora_inicio: string
  hora_fim: string
  usuarios: string[]
}

type Props = {
  mes: Date
  plantoes: Plantao[]
  onMesChange: (mes: Date) => void
  onSelectPlantao: (plantao: Plantao) => void
}

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]

function formatarDataLocal(d: Date) {
  const ano = d.getFullYear()
  const mes = String(d.getMonth() + 1).padStart(2, "0")
  const dia = String(d.getDate()).padStart(2, "0")
  return `${ano}-${mes}-${dia}`
}

function gerarCelulas(mes: Date) {
  const ano = mes.getFullYear()
  const mesIndex = mes.getMonth()
  const primeiroDia = new Date(ano, mesIndex, 1)
  const ultimoDia = new Date(ano, mesIndex + 1, 0)
  const diaSemanaInicio = primeiroDia.getDay()

  const celulas: { data: Date; noMes: boolean }[] = []

  for (let i = diaSemanaInicio - 1; i >= 0; i--) {
    celulas.push({ data: new Date(ano, mesIndex, -i), noMes: false })
  }
  for (let d = 1; d <= ultimoDia.getDate(); d++) {
    celulas.push({ data: new Date(ano, mesIndex, d), noMes: true })
  }
  while (celulas.length % 7 !== 0) {
    const ultima = celulas[celulas.length - 1].data
    celulas.push({ data: new Date(ultima.getFullYear(), ultima.getMonth(), ultima.getDate() + 1), noMes: false })
  }

  return celulas
}

export default function PlantaoCalendario({ mes, plantoes, onMesChange, onSelectPlantao }: Props) {
  const celulas = gerarCelulas(mes)
  const hojeChave = formatarDataLocal(new Date())

  const plantoesPorDia = new Map<string, Plantao[]>()
  for (const p of plantoes) {
    const lista = plantoesPorDia.get(p.data) ?? []
    lista.push(p)
    plantoesPorDia.set(p.data, lista)
  }

  function mesAnterior() {
    onMesChange(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))
  }

  function mesSeguinte() {
    onMesChange(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))
  }

  function irParaHoje() {
    const hoje = new Date()
    onMesChange(new Date(hoje.getFullYear(), hoje.getMonth(), 1))
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-800 capitalize">
          {mes.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={irParaHoje}
            className="text-xs font-semibold text-brand-700 hover:text-brand-900 px-2 py-1.5 rounded-lg hover:bg-brand-50 transition-colors mr-1"
          >
            Hoje
          </button>
          <button
            type="button"
            onClick={mesAnterior}
            aria-label="Mês anterior"
            className="text-gray-500 hover:text-gray-800 hover:bg-gray-100 p-1.5 rounded-lg transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={mesSeguinte}
            aria-label="Próximo mês"
            className="text-gray-500 hover:text-gray-800 hover:bg-gray-100 p-1.5 rounded-lg transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          <div className="grid grid-cols-7 mb-1">
            {DIAS_SEMANA.map((dia) => (
              <div key={dia} className="text-center text-xs font-semibold text-gray-400 py-1">
                {dia}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden border border-gray-200">
            {celulas.map(({ data, noMes }) => {
              const chave = formatarDataLocal(data)
              const doDia = plantoesPorDia.get(chave) ?? []
              const ehHoje = chave === hojeChave

              return (
                <div
                  key={chave + (noMes ? "-fora" : "")}
                  className={`min-h-[88px] sm:min-h-[108px] p-1.5 flex flex-col gap-1 ${noMes ? "bg-gray-50" : "bg-white"}`}
                >
                  <span
                    className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-medium ${
                      ehHoje ? "bg-brand-700 text-white" : noMes ? "text-gray-300" : "text-gray-600"
                    }`}
                  >
                    {data.getDate()}
                  </span>

                  <div className="flex-1 space-y-1 overflow-hidden">
                    {doDia.slice(0, 3).map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => onSelectPlantao(p)}
                        title={p.titulo}
                        className="w-full text-left bg-brand-100 hover:bg-brand-200 text-brand-800 text-[10px] sm:text-xs font-medium px-1.5 py-0.5 rounded truncate transition-colors"
                      >
                        {p.hora_inicio.slice(0, 5)} {p.titulo}
                      </button>
                    ))}
                    {doDia.length > 3 && (
                      <p className="text-[10px] text-gray-400 px-1.5">+{doDia.length - 3} mais</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
