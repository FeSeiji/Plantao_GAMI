"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import NovoPlantaoModal from "../../../components/NovoPlantaoModal";
import PlantaoModal, {
  ROLES_EDITAR_PLANTAO,
} from "../../../components/PlantaoModal";
import PlantaoCalendario, {
  Plantao,
  Visualizacao,
  calcularIntervaloVisivel,
} from "../../../components/PlantaoCalendario";
import { apiFetch } from "../../../components/sessao";

export default function PlantoesPage() {
  const router = useRouter();
  const [plantoes, setPlantoes] = useState<Plantao[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [podeCriar, setPodeCriar] = useState(false);
  const [visualizacao, setVisualizacao] = useState<Visualizacao>("semana");
  const [dataReferencia, setDataReferencia] = useState(() => new Date());
  const [plantaoSelecionado, setPlantaoSelecionado] = useState<Plantao | null>(
    null,
  );
  const [carregouUmaVez, setCarregouUmaVez] = useState(false);
  const [filtroTipo, setFiltroTipo] = useState<
    "todos" | "plantonista" | "socio"
  >("todos");

  const { inicio, fim } = useMemo(
    () => calcularIntervaloVisivel(dataReferencia, visualizacao),
    [dataReferencia, visualizacao],
  );

  const carregarPlantoes = useCallback(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    setLoading(true);
    const params = new URLSearchParams({ inicio, fim });
    if (filtroTipo !== "todos") params.set("tipo", filtroTipo);
    apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/plantoes?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok)
          throw new Error(
            data.error ?? "Não foi possível carregar os plantões.",
          );
        setPlantoes(data);
      })
      .catch((err) => setError(err.message))
      .finally(() => {
        setLoading(false);
        setCarregouUmaVez(true);
      });
  }, [inicio, fim, filtroTipo]);

  useEffect(() => {
    const token = localStorage.getItem("token");

    if (!token) {
      router.push("/login");
      return;
    }
    try {
      const roles: string[] = JSON.parse(localStorage.getItem("roles") ?? "[]");
      setPodeCriar(roles.some((r) => ROLES_EDITAR_PLANTAO.includes(r)));
    } catch {
      setPodeCriar(false);
    }
  }, [router]);

  useEffect(() => {
    carregarPlantoes();
  }, [carregarPlantoes]);

  return (
    <main className="max-w-screen-2xl mx-auto px-3 sm:px-6 py-6 sm:py-12">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 sm:mb-6">
        <h1 className="text-xl font-bold text-gray-800">Plantões</h1>

        {/* No celular o filtro e o botão ocupam a linha toda, abaixo do título */}
        <div className="flex w-full sm:w-auto items-center gap-3">
          <div className="flex flex-1 sm:flex-none items-center bg-gray-100 rounded-lg p-0.5">
            {(
              [
                { valor: "todos", rotulo: "Todos" },
                { valor: "plantonista", rotulo: "Plantonista" },
                { valor: "socio", rotulo: "Sócio" },
              ] as const
            ).map((opcao) => (
              <button
                key={opcao.valor}
                type="button"
                onClick={() => setFiltroTipo(opcao.valor)}
                className={`flex-1 sm:flex-none text-xs font-semibold px-2.5 py-1.5 rounded-md transition-colors ${
                  filtroTipo === opcao.valor
                    ? "bg-white text-brand-700 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {opcao.rotulo}
              </button>
            ))}
          </div>

          {podeCriar && (
            <button
              onClick={() => setShowModal(true)}
              className="shrink-0 bg-brand-700 hover:bg-brand-800 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              + Novo plantão
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-6">
          {error}
        </p>
      )}

      {!carregouUmaVez && loading ? (
        <p className="text-gray-400 text-sm">Carregando...</p>
      ) : (
        <div
          className={
            loading
              ? "opacity-60 pointer-events-none transition-opacity"
              : "transition-opacity"
          }
        >
          <PlantaoCalendario
            visualizacao={visualizacao}
            dataReferencia={dataReferencia}
            plantoes={plantoes}
            onVisualizacaoChange={setVisualizacao}
            onDataReferenciaChange={setDataReferencia}
            onSelectPlantao={setPlantaoSelecionado}
          />
        </div>
      )}

      {showModal && (
        <NovoPlantaoModal
          onClose={() => setShowModal(false)}
          onCreated={carregarPlantoes}
        />
      )}

      {plantaoSelecionado && (
        <PlantaoModal
          plantao={plantaoSelecionado}
          podeEditar
          onClose={() => setPlantaoSelecionado(null)}
          onUpdated={carregarPlantoes}
        />
      )}
    </main>
  );
}
