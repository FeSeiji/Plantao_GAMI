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
import PlantaoExtraModal from "../../../components/PlantaoExtraModal";
import { PlantaoExtra } from "../../../components/extras";
import { EVENTO_TROCAS_ATUALIZADAS } from "../../../components/NotificacaoTrocaSino";

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
  const [extras, setExtras] = useState<PlantaoExtra[]>([]);
  // undefined: fechado; null: novo plantão extra
  const [extraAberto, setExtraAberto] = useState<PlantaoExtra | null | undefined>(undefined);

  const { inicio, fim } = useMemo(
    () => calcularIntervaloVisivel(dataReferencia, visualizacao),
    [dataReferencia, visualizacao],
  );

  const carregarPlantoes = useCallback(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    setLoading(true);
    const params = new URLSearchParams({ inicio, fim });
    const buscar = async (caminho: string) => {
      const res = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL}${caminho}?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error ?? "Não foi possível carregar os plantões.");
      return data;
    };
    Promise.all([buscar("/plantoes"), buscar("/plantoes-extras")])
      .then(([plantoesDoPeriodo, extrasDoPeriodo]) => {
        setPlantoes(plantoesDoPeriodo);
        setExtras(extrasDoPeriodo);
        setError("");
      })
      .catch((err) => setError(err.message))
      .finally(() => {
        setLoading(false);
        setCarregouUmaVez(true);
      });
  }, [inicio, fim]);

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

  // Resposta pelo sino (troca, férias, pedido de vaga) muda a escala que está na tela
  useEffect(() => {
    window.addEventListener(EVENTO_TROCAS_ATUALIZADAS, carregarPlantoes);
    return () => window.removeEventListener(EVENTO_TROCAS_ATUALIZADAS, carregarPlantoes);
  }, [carregarPlantoes]);

  return (
    <main className="max-w-screen-2xl mx-auto px-3 sm:px-6 py-6 sm:py-12">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 sm:mb-6">
        <h1 className="text-xl font-bold text-gray-800">Plantões</h1>

        {podeCriar && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setExtraAberto(null)}
              className="shrink-0 border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              + Plantão extra
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="shrink-0 bg-brand-700 hover:bg-brand-800 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              + Novo plantão
            </button>
          </div>
        )}
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
            extras={extras}
            onSelectExtra={setExtraAberto}
          />
        </div>
      )}

      {showModal && (
        <NovoPlantaoModal
          onClose={() => setShowModal(false)}
          onCreated={carregarPlantoes}
        />
      )}

      {extraAberto !== undefined && (
        <PlantaoExtraModal
          extra={extraAberto}
          podeEditar={podeCriar}
          onClose={() => setExtraAberto(undefined)}
          onSaved={carregarPlantoes}
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
