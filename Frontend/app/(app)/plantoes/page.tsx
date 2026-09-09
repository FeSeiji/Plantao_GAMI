"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import NovoPlantaoModal from "../../../components/NovoPlantaoModal"

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
      ) : plantoes.length === 0 ? (
        <p className="text-gray-400 text-sm">Nenhum plantão cadastrado ainda.</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {plantoes.map((p) => (
            <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <h2 className="font-semibold text-gray-900 mb-1">{p.titulo}</h2>
              <p className="text-sm text-gray-500 mb-3">
                {new Date(`${p.data}T00:00:00`).toLocaleDateString("pt-BR")} · {p.hora_inicio.slice(0, 5)} - {p.hora_fim.slice(0, 5)}
              </p>
              {p.descricao && <p className="text-sm text-gray-600 mb-3">{p.descricao}</p>}
              <p className="text-xs text-gray-400">
                {p.usuarios.length} usuário{p.usuarios.length === 1 ? "" : "s"} atribuído{p.usuarios.length === 1 ? "" : "s"}
              </p>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <NovoPlantaoModal onClose={() => setShowModal(false)} onCreated={carregarPlantoes} />
      )}
    </main>
  )
}
