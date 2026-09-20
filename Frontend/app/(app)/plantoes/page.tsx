"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import NovoPlantaoModal from "../../../components/NovoPlantaoModal"
import PlantaoModal from "../../../components/PlantaoModal"
import PlantaoCalendario from "../../../components/PlantaoCalendario"

type Plantao = {
  id: string
  titulo: string
  descricao: string | null
  data: string
  hora_inicio: string
  hora_fim: string
  usuarios: string[]
}

export default function PlantoesPage() {
  const router = useRouter()
  const [plantoes, setPlantoes] = useState<Plantao[]>([])
  const [roles, setRoles] = useState<string[]>([])
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [mes, setMes] = useState(() => {
    const hoje = new Date()
    return new Date(hoje.getFullYear(), hoje.getMonth(), 1)
  })
  const [plantaoSelecionado, setPlantaoSelecionado] = useState<Plantao | null>(null)

  const carregarPlantoes = useCallback(() => {
    const token = localStorage.getItem("token")
    if (!token) return

    setLoading(true)
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/plantoes`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? "Não foi possível carregar os plantões.")
        setPlantoes(data)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const token = localStorage.getItem("token")

    if (!token) {
      router.push("/login")
      return
    }

    setRoles(JSON.parse(localStorage.getItem("roles") ?? "[]"))
    carregarPlantoes()
  }, [router, carregarPlantoes])

  const podeGerenciar = roles.includes("coordenador") || roles.includes("admin") || roles.includes("tecnico")

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-xl font-bold text-gray-800">Plantões</h1>
        {podeGerenciar && (
          <button
            onClick={() => setShowModal(true)}
            className="bg-brand-700 hover:bg-brand-800 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            + Novo plantão
          </button>
        )}
      </div>

      {error && (
        <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-6">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-gray-400 text-sm">Carregando...</p>
      ) : (
        <PlantaoCalendario
          mes={mes}
          plantoes={plantoes}
          onMesChange={setMes}
          onSelectPlantao={setPlantaoSelecionado}
        />
      )}

      {showModal && (
        <NovoPlantaoModal onClose={() => setShowModal(false)} onCreated={carregarPlantoes} />
      )}

      {plantaoSelecionado && (
        <PlantaoModal
          plantao={plantaoSelecionado}
          podeEditar={podeGerenciar}
          onClose={() => setPlantaoSelecionado(null)}
          onUpdated={carregarPlantoes}
        />
      )}
    </main>
  )
}
