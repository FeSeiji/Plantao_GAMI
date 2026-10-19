"use client";

import React, { useCallback, useEffect, useState } from "react";
import SiglaBadge from "./SiglaBadge";
import GradeParticipantes, {
  AcaoMenu,
  CelulaGrade,
} from "./GradeParticipantes";
import {
  Afastamento,
  AvisoAfastamento,
  AvisoIndisponivel,
  afastamentoPendente,
  rotuloAfastamento,
} from "./disponibilidade";
import ConfirmacaoModal, { Confirmacao } from "./ConfirmacaoModal";
import SeletorTrocaPorHoras from "./SeletorTrocaPorHoras";
import { EVENTO_TROCAS_ATUALIZADAS } from "./NotificacaoTrocaSino";
import {
  TURNOS,
  Turno,
  descreverPosicao,
  ehVagaDeCoordenador,
  formatarTurnoDoDia,
  horarioDaVaga,
  rotuloPosicaoAbreviado,
  turnoDaPosicao,
  vagasDoTurno,
} from "./posicoes";
import { apiFetch } from "./sessao";
import {
  dataDaCobertura,
  formatarIntervalo,
} from "./trocaPorHoras";

type Pessoa = {
  id: string;
  nome?: string | null;
  email?: string | null;
  sigla?: string | null;
};

type TrocaPendente = {
  id: string;
  solicitadoEm: string;
  usuarioEntrada: Pessoa;
  solicitadoPor: Pessoa;
  // Quem precisa aceitar: o substituto ou, se ele mesmo pediu a vaga, o titular
  respondenteId?: string;
  // Preenchidos na troca por horas
  horaInicio?: string | null;
  horaFim?: string | null;
};

// Troca por horas aceita: a vaga continua do titular e "usuario" cobre o intervalo
type Cobertura = {
  id: string;
  usuario: Pessoa;
  horaInicio: string;
  horaFim: string;
};

type TrocaHistorico = {
  id: string;
  posicao?: number;
  status: "pendente" | "aceita" | "recusada" | "cancelada";
  solicitadoEm: string;
  respondidoEm: string | null;
  usuarioSaida: Pessoa;
  usuarioEntrada: Pessoa;
  solicitadoPor: Pessoa;
  horaInicio?: string | null;
  horaFim?: string | null;
};

type RemocaoHistorico = {
  id: string;
  removidoEm: string;
  eraCoordenador: boolean;
  posicao: number | null;
  usuario: Pessoa;
  removidoPor: Pessoa;
};

type MudancaPosicaoHistorico = {
  id: string;
  alteradoEm: string;
  posicaoAnterior: number | null;
  posicaoNova: number;
  usuario: Pessoa;
  usuarioTrocado: Pessoa | null;
  alteradoPor: Pessoa;
};

// Pedido de um médico para entrar numa vaga livre; a gestão aprova ou recusa
type PedidoVaga = {
  id: string;
  posicao: number;
  status: "pendente" | "aprovado" | "recusado" | "cancelado";
  solicitadoEm: string;
  respondidoEm: string | null;
  usuario: Pessoa;
  respondidoPor: Pessoa | null;
};

type EventoHistorico =
  | { tipo: "troca"; quando: string; troca: TrocaHistorico }
  | { tipo: "remocao"; quando: string; remocao: RemocaoHistorico }
  | { tipo: "posicao"; quando: string; mudanca: MudancaPosicaoHistorico }
  | { tipo: "pedido"; quando: string; pedido: PedidoVaga };

// Quem pode mudar médicos de vaga — mesma lista do requireRole em Backend/src/routes/plantoes.js.
// Fora da gestão, só nos plantões em que está escalado
const ROLES_MUDAR_POSICAO = ["escritorio", "admin", "anestesita_socio", "anestesita_plantonista", "tecnico"];
// Preencher e esvaziar vagas: só a gestão — mesma lista em Backend/src/routes/plantoes.js
const ROLES_GERIR_EQUIPE = ["escritorio", "admin", "tecnico"];
// Criar e editar plantões (dia, título): só a gestão — mesma lista em Backend/src/routes/plantoes.js
export const ROLES_EDITAR_PLANTAO = ["escritorio", "admin", "tecnico"];
// Pedir uma vaga livre: só médicos — mesma lista em Backend/src/routes/plantoes.js
const ROLES_MEDICO = ["anestesita_socio", "anestesita_plantonista"];

type Usuario = {
  id: string;
  nome?: string | null;
  email?: string | null;
  sigla?: string | null;
  coordenador?: boolean;
  posicao?: number | null;
  trocaPendente?: TrocaPendente | null;
  dias_disponiveis?: number[] | null;
  afastamento?: Afastamento | null;
  cobertura?: Cobertura | null;
};

// Um plantão por dia, com as vagas do diurno e do noturno (components/posicoes.ts)
type Plantao = {
  id: string;
  titulo: string;
  descricao: string | null;
  data: string;
  usuarios: Usuario[];
};

type Props = {
  plantao: Plantao;
  podeEditar: boolean;
  onClose: () => void;
  onUpdated: () => void;
};

function nomeDe(p: Pessoa) {
  return p.nome ?? p.email ?? p.id;
}

export default function PlantaoModal({
  plantao: plantaoInicial,
  podeEditar,
  onClose,
  onUpdated,
}: Props) {
  // A tela que abriu o modal guarda uma cópia do plantão; depois de salvar, vale o que o servidor devolveu
  const [plantao, setPlantao] = useState(plantaoInicial);
  const [editando, setEditando] = useState(false);

  const [titulo, setTitulo] = useState(plantao.titulo);
  const [descricao, setDescricao] = useState(plantao.descricao ?? "");
  const [data, setData] = useState(plantao.data);

  const [selecionados, setSelecionados] = useState<Usuario[]>(plantao.usuarios);
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<Usuario[]>([]);
  const [buscando, setBuscando] = useState(false);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [historico, setHistorico] = useState<TrocaHistorico[]>([]);
  const [remocoes, setRemocoes] = useState<RemocaoHistorico[]>([]);
  const [mudancasPosicao, setMudancasPosicao] = useState<
    MudancaPosicaoHistorico[]
  >([]);
  const [podeMudarPosicao, setPodeMudarPosicao] = useState(false);
  const [podeGerirEquipe, setPodeGerirEquipe] = useState(false);
  const [podeEditarPlantao, setPodeEditarPlantao] = useState(false);
  const [souMedico, setSouMedico] = useState(false);
  const [pedidosVaga, setPedidosVaga] = useState<PedidoVaga[]>([]);
  const [confirmacao, setConfirmacao] = useState<Confirmacao | null>(null);
  // Vaga com o painel de troca aberto
  const [trocandoPosicao, setTrocandoPosicao] = useState<number | null>(null);
  // Troca por horas: "inicio" = do começo da vaga até horaParcial; "fim" = de horaParcial até o fim
  const [trocaParcial, setTrocaParcial] = useState<"inicio" | "fim" | null>(null);
  const [horaParcial, setHoraParcial] = useState("");
  const [buscaTroca, setBuscaTroca] = useState("");
  const [resultadosTroca, setResultadosTroca] = useState<Usuario[]>([]);
  const [buscandoTroca, setBuscandoTroca] = useState(false);
  const [meuId, setMeuId] = useState<string | null>(null);
  // Vaga vazia que abriu a busca de adição
  const [adicionando, setAdicionando] = useState<{ posicao: number } | null>(
    null,
  );

  // O titular da vaga em troca e o horário dela (o do turno)
  const usuarioTrocando =
    trocandoPosicao != null
      ? selecionados.find((u) => u.posicao === trocandoPosicao)
      : undefined;
  const horarioTrocando =
    trocandoPosicao != null ? horarioDaVaga(plantao.data, trocandoPosicao) : null;
  // Troca por horas: o intervalo escolhido na linha do tempo do painel de troca
  const intervaloTroca =
    trocaParcial && horaParcial && horarioTrocando
      ? trocaParcial === "inicio"
        ? { horaInicio: horarioTrocando.hora_inicio, horaFim: horaParcial }
        : { horaInicio: horaParcial, horaFim: horarioTrocando.hora_fim }
      : null;
  // Médico fora da gestão só mexe nas posições dos plantões em que está escalado
  const estouEscalado = selecionados.some((u) => u.id === meuId);
  // O mesmo médico pode estar no diurno e no noturno, mas não duas vezes no mesmo turno
  const noTurno = (usuarioId: string | null, turno: Turno) =>
    selecionados.some(
      (u) => u.id === usuarioId && u.posicao != null && turnoDaPosicao(u.posicao) === turno,
    );
  // Médico fora da gestão troca a própria vaga com quem quiser; na vaga de outro, só pede a vaga para si
  const pedindoVagaParaMim =
    usuarioTrocando != null && !podeGerirEquipe && usuarioTrocando.id !== meuId;

  useEffect(() => {
    setMeuId(localStorage.getItem("userId"));
    try {
      const roles: string[] = JSON.parse(localStorage.getItem("roles") ?? "[]");
      setPodeMudarPosicao(roles.some((r) => ROLES_MUDAR_POSICAO.includes(r)));
      setPodeGerirEquipe(roles.some((r) => ROLES_GERIR_EQUIPE.includes(r)));
      setPodeEditarPlantao(roles.some((r) => ROLES_EDITAR_PLANTAO.includes(r)));
      setSouMedico(roles.some((r) => ROLES_MEDICO.includes(r)));
    } catch {
      setPodeMudarPosicao(false);
      setPodeGerirEquipe(false);
      setPodeEditarPlantao(false);
      setSouMedico(false);
    }
  }, []);

  const carregarHistorico = useCallback(() => {
    const token = localStorage.getItem("token");
    const buscar = (caminho: string) =>
      apiFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/plantoes/${plantao.id}/${caminho}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      ).then((res) => (res.ok ? res.json() : null));

    buscar("trocas")
      .then((data) => data && setHistorico(data))
      .catch(() => {});
    buscar("remocoes")
      .then((data) => data && setRemocoes(data))
      .catch(() => {});
    buscar("mudancas-posicao")
      .then((data) => data && setMudancasPosicao(data))
      .catch(() => {});
    buscar("pedidos-vaga")
      .then((data) => data && setPedidosVaga(data))
      .catch(() => {});
  }, [plantao.id]);

  useEffect(() => {
    carregarHistorico();
  }, [carregarHistorico]);

  useEffect(() => {
    const termo = buscaTroca.trim();

    if (!termo || !horarioTrocando) {
      setResultadosTroca([]);
      setBuscandoTroca(false);
      return;
    }

    setBuscandoTroca(true);
    const timeoutId = setTimeout(() => {
      const token = localStorage.getItem("token");
      // O substituto precisa estar livre no turno da vaga; na troca por horas, só no intervalo
      const params = new URLSearchParams({
        search: termo,
        role: "anestesita_plantonista,anestesita_socio",
        data: intervaloTroca
          ? dataDaCobertura(horarioTrocando, intervaloTroca.horaInicio)
          : plantao.data,
        horaInicio: intervaloTroca?.horaInicio ?? horarioTrocando.hora_inicio,
        horaFim: intervaloTroca?.horaFim ?? horarioTrocando.hora_fim,
      });
      apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/users?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(async (res) => {
          const resultado = await res.json();
          if (res.ok) setResultadosTroca(resultado);
        })
        .catch(() => {})
        .finally(() => setBuscandoTroca(false));
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [buscaTroca, trocandoPosicao, intervaloTroca?.horaInicio, intervaloTroca?.horaFim]);

  useEffect(() => {
    const termo = busca.trim();

    if (!termo || !adicionando) {
      setResultados([]);
      setBuscando(false);
      return;
    }

    setBuscando(true);
    const timeoutId = setTimeout(() => {
      const token = localStorage.getItem("token");
      // Quem já está no turno da vaga (aqui ou em outro plantão) não aparece
      const horario = horarioDaVaga(plantao.data, adicionando.posicao);
      const params = new URLSearchParams({
        search: termo,
        role: "anestesita_plantonista,anestesita_socio",
        data: plantao.data,
        horaInicio: horario.hora_inicio,
        horaFim: horario.hora_fim,
      });
      apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/users?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(async (res) => {
          const resultado = await res.json();
          if (res.ok) setResultados(resultado);
        })
        .catch(() => {})
        .finally(() => setBuscando(false));
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [busca, adicionando?.posicao]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  function cancelarEdicao() {
    setTitulo(plantao.titulo);
    setDescricao(plantao.descricao ?? "");
    setData(plantao.data);
    setError("");
    setEditando(false);
    abrirAdicao(null);
    abrirTroca(null);
  }

  function abrirAdicao(alvo: { posicao: number } | null) {
    setAdicionando(alvo);
    setBusca("");
    setResultados([]);
    if (alvo) setTrocandoPosicao(null);
  }

  function abrirTroca(posicao: number | null) {
    setTrocandoPosicao(posicao);
    setBuscaTroca("");
    setResultadosTroca([]);
    setTrocaParcial(null);
    setHoraParcial("");
    if (posicao != null) setAdicionando(null);
  }

  // A troca é da vaga: quem está nela sai e usuarioEntrada entra
  async function solicitarTroca(
    posicao: number,
    usuarioEntrada: Usuario,
    intervalo: { horaInicio: string; horaFim: string } | null,
  ) {
    setError("");
    abrirTroca(null);

    try {
      const token = localStorage.getItem("token");
      const res = await apiFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/plantoes/${plantao.id}/trocas`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            posicao,
            usuario_entrada: usuarioEntrada.id,
            ...(intervalo
              ? { hora_inicio: intervalo.horaInicio, hora_fim: intervalo.horaFim }
              : {}),
          }),
        },
      );

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error ?? "Não foi possível solicitar a troca.");
      }

      setSelecionados((prev) =>
        prev.map((u) =>
          u.posicao === posicao
            ? {
                ...u,
                trocaPendente: {
                  id: result.id,
                  solicitadoEm: result.solicitadoEm,
                  usuarioEntrada: result.usuarioEntrada,
                  solicitadoPor: result.solicitadoPor,
                  respondenteId: result.respondenteId,
                  horaInicio: result.horaInicio,
                  horaFim: result.horaFim,
                },
              }
            : u,
        ),
      );
      setHistorico((prev) => [result, ...prev]);
      window.dispatchEvent(new Event(EVENTO_TROCAS_ATUALIZADAS));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível solicitar a troca.",
      );
    }
  }

  function desfazerCobertura(posicao: number, cobertura: Cobertura) {
    setConfirmacao({
      titulo: "Desfazer troca por horas?",
      mensagem: (
        <p>
          {nomeDe(cobertura.usuario)} deixa de cobrir{" "}
          {formatarIntervalo(cobertura.horaInicio, cobertura.horaFim)} e a vaga
          volta inteira para o titular.
        </p>
      ),
      rotuloConfirmar: "Desfazer",
      perigo: true,
      acao: async () => {
        setError("");
        try {
          const token = localStorage.getItem("token");
          const res = await apiFetch(
            `${process.env.NEXT_PUBLIC_API_URL}/plantoes/${plantao.id}/trocas/${cobertura.id}/cancelar`,
            { method: "PATCH", headers: { Authorization: `Bearer ${token}` } },
          );
          if (!res.ok) {
            const result = await res.json().catch(() => ({}));
            throw new Error(result.error ?? "Não foi possível desfazer a troca por horas.");
          }
          setSelecionados((prev) =>
            prev.map((u) => (u.posicao === posicao ? { ...u, cobertura: null } : u)),
          );
          carregarHistorico();
          onUpdated();
        } catch (err) {
          setError(
            err instanceof Error ? err.message : "Não foi possível desfazer a troca por horas.",
          );
        }
      },
    });
  }

  // Quem pediu (ou a gestão) desiste do pedido antes do aceite
  function cancelarPedidoTroca(posicao: number, pendente: TrocaPendente) {
    setConfirmacao({
      titulo: "Cancelar pedido de troca?",
      mensagem: (
        <p>
          O pedido para {nomeDe(pendente.usuarioEntrada)} entrar
          {pendente.horaInicio && pendente.horaFim
            ? ` das ${formatarIntervalo(pendente.horaInicio, pendente.horaFim).replace("–", " às ")}`
            : ""}{" "}
          é cancelado e a vaga fica livre para outro pedido.
        </p>
      ),
      rotuloConfirmar: "Cancelar pedido",
      perigo: true,
      acao: async () => {
        setError("");
        try {
          const token = localStorage.getItem("token");
          const res = await apiFetch(
            `${process.env.NEXT_PUBLIC_API_URL}/plantoes/${plantao.id}/trocas/${pendente.id}/cancelar`,
            { method: "PATCH", headers: { Authorization: `Bearer ${token}` } },
          );
          if (!res.ok) {
            const result = await res.json().catch(() => ({}));
            throw new Error(result.error ?? "Não foi possível cancelar o pedido.");
          }
          setSelecionados((prev) =>
            prev.map((u) => (u.posicao === posicao ? { ...u, trocaPendente: null } : u)),
          );
          carregarHistorico();
          window.dispatchEvent(new Event(EVENTO_TROCAS_ATUALIZADAS));
          onUpdated();
        } catch (err) {
          setError(
            err instanceof Error ? err.message : "Não foi possível cancelar o pedido.",
          );
        }
      },
    });
  }

  async function responderTrocaAqui(
    trocaId: string,
    posicao: number,
    aceitar: boolean,
  ) {
    setError("");

    try {
      const token = localStorage.getItem("token");
      const res = await apiFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/plantoes/trocas/${trocaId}/${aceitar ? "aceitar" : "recusar"}`,
        {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      const result = await res.json();

      if (!res.ok) {
        throw new Error(
          result.error ?? "Não foi possível responder a essa solicitação.",
        );
      }

      setSelecionados((prev) =>
        prev.map((u) => {
          if (u.posicao !== posicao) return u;
          if (!aceitar) return { ...u, trocaPendente: null };
          // Troca por horas: a vaga continua do titular, agora com a cobertura
          if (result.horaInicio) {
            return {
              ...u,
              trocaPendente: null,
              cobertura: {
                id: result.id,
                usuario: result.usuarioEntrada,
                horaInicio: result.horaInicio,
                horaFim: result.horaFim,
              },
            };
          }
          return {
            ...result.usuarioEntrada,
            coordenador: u.coordenador,
            posicao: u.posicao,
            trocaPendente: null,
          };
        }),
      );
      setHistorico((prev) => prev.map((h) => (h.id === trocaId ? result : h)));
      window.dispatchEvent(new Event(EVENTO_TROCAS_ATUALIZADAS));
      onUpdated();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível responder a essa solicitação.",
      );
    }
  }

  // Depois que a gestão aprova um pedido, o médico entra na vaga: busca o plantão de novo
  async function recarregarPlantao() {
    const token = localStorage.getItem("token");
    const res = await apiFetch(
      `${process.env.NEXT_PUBLIC_API_URL}/plantoes/${plantao.id}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) return;
    const result = await res.json();
    setPlantao(result);
    setSelecionados(result.usuarios);
  }

  async function chamarPedidoVaga(caminho: string, method: "POST" | "PATCH", body?: object) {
    const token = localStorage.getItem("token");
    const res = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/plantoes/${caminho}`, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        Authorization: `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(result.error ?? "Não foi possível concluir o pedido.");
    return result;
  }

  // Médico pede uma vaga livre; entra quando a gestão aprovar
  function pedirVaga(posicao: number) {
    setConfirmacao({
      titulo: "Pedir esta vaga?",
      mensagem: (
        <p>
          Você pede a vaga de{" "}
          <span className="font-semibold">{descreverPosicao(plantao.data, posicao)}</span> neste
          plantão. Você entra na escala quando a gestão aprovar.
        </p>
      ),
      rotuloConfirmar: "Pedir vaga",
      acao: async () => {
        setError("");
        try {
          const pedido = await chamarPedidoVaga(`${plantao.id}/pedidos-vaga`, "POST", { posicao });
          setPedidosVaga((prev) => [pedido, ...prev]);
          window.dispatchEvent(new Event(EVENTO_TROCAS_ATUALIZADAS));
        } catch (err) {
          setError(err instanceof Error ? err.message : "Não foi possível pedir a vaga.");
        }
      },
    });
  }

  function cancelarPedidoVaga(pedido: PedidoVaga) {
    setConfirmacao({
      titulo: "Cancelar pedido?",
      mensagem: (
        <p>
          O seu pedido da vaga de {descreverPosicao(plantao.data, pedido.posicao)} é cancelado.
        </p>
      ),
      rotuloConfirmar: "Cancelar pedido",
      perigo: true,
      acao: async () => {
        setError("");
        try {
          await chamarPedidoVaga(`pedidos-vaga/${pedido.id}/cancelar`, "PATCH");
          carregarHistorico();
          window.dispatchEvent(new Event(EVENTO_TROCAS_ATUALIZADAS));
        } catch (err) {
          setError(err instanceof Error ? err.message : "Não foi possível cancelar o pedido.");
        }
      },
    });
  }

  // Gestão: aprovar coloca o médico na vaga (e recusa os outros pedidos dela)
  async function responderPedidoVaga(pedido: PedidoVaga, aprovar: boolean) {
    setError("");
    try {
      await chamarPedidoVaga(`pedidos-vaga/${pedido.id}/${aprovar ? "aprovar" : "recusar"}`, "PATCH");
      if (aprovar) {
        await recarregarPlantao();
        onUpdated();
      }
      carregarHistorico();
      window.dispatchEvent(new Event(EVENTO_TROCAS_ATUALIZADAS));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível responder ao pedido.");
    }
  }

  async function adicionarUsuario(usuario: Usuario) {
    const alvo = adicionando;
    abrirAdicao(null);
    setError("");

    if (!alvo) return;

    const posicao = alvo.posicao;
    if (selecionados.some((u) => u.posicao === posicao)) return;
    if (noTurno(usuario.id, turnoDaPosicao(posicao))) return;
    const anterior = selecionados;
    setSelecionados((prev) => [
      ...prev,
      { ...usuario, posicao, coordenador: ehVagaDeCoordenador(posicao) },
    ]);

    try {
      const token = localStorage.getItem("token");
      const body = { fila: [{ usuario_id: usuario.id, posicao }] };

      const res = await apiFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/plantoes/${plantao.id}/usuarios`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        },
      );

      if (!res.ok) {
        const result = await res.json();
        throw new Error(result.error ?? "Não foi possível adicionar o médico.");
      }

      onUpdated();
    } catch (err) {
      setSelecionados(anterior);
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível adicionar o médico.",
      );
    }
  }

  // Move o médico da vaga posicao para novaPosicao, inclusive entre o diurno e o noturno.
  // Se a vaga nova estiver ocupada, os dois trocam de lugar. A vaga define quem é coordenador
  async function alterarPosicao(posicao: number, novaPosicao: number) {
    setError("");
    const anterior = selecionados;
    const naPosicao = (u: Usuario, p: number) => ({
      ...u,
      posicao: p,
      coordenador: ehVagaDeCoordenador(p),
    });
    setSelecionados((prev) =>
      prev.map((u) => {
        if (u.posicao === posicao) return naPosicao(u, novaPosicao);
        if (u.posicao === novaPosicao) return naPosicao(u, posicao);
        return u;
      }),
    );

    try {
      const token = localStorage.getItem("token");
      const res = await apiFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/plantoes/${plantao.id}/posicao`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ posicao, nova_posicao: novaPosicao }),
        },
      );

      if (!res.ok) {
        const result = await res.json();
        throw new Error(result.error ?? "Não foi possível alterar a posição.");
      }

      onUpdated();
      carregarHistorico();
    } catch (err) {
      setSelecionados(anterior);
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível alterar a posição.",
      );
    }
  }

  // Esvazia a vaga (o mesmo médico pode estar em outra vaga do plantão)
  async function removerUsuario(posicao: number) {
    setError("");
    const anterior = selecionados;
    setSelecionados((prev) => prev.filter((u) => u.posicao !== posicao));

    try {
      const token = localStorage.getItem("token");
      const res = await apiFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/plantoes/${plantao.id}/vagas/${posicao}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (!res.ok && res.status !== 204) {
        const result = await res.json().catch(() => ({}));
        throw new Error(result.error ?? "Não foi possível remover o médico.");
      }

      onUpdated();
      carregarHistorico();
    } catch (err) {
      setSelecionados(anterior);
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível remover o médico.",
      );
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const token = localStorage.getItem("token");
      const res = await apiFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/plantoes/${plantao.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            titulo,
            descricao: descricao || null,
            data,
          }),
        },
      );

      const result = await res.json();

      if (!res.ok) {
        setError(result.error ?? "Não foi possível salvar as alterações.");
        return;
      }

      setPlantao(result);
      setSelecionados(result.usuarios);
      onUpdated();
      setEditando(false);
    } catch {
      setError("Não foi possível conectar ao servidor.");
    } finally {
      setLoading(false);
    }
  }

  function confirmarRemocao(u: Usuario) {
    setConfirmacao({
      titulo: "Remover médico?",
      mensagem: (
        <>
          <p>
            <span className="font-semibold">{nomeDe(u)}</span> será removido
            deste plantão
            {u.posicao != null ? ` (${descreverPosicao(plantao.data, u.posicao)})` : ""}
            . A remoção fica registrada no histórico.
          </p>
          {u.trocaPendente && (
            <p className="mt-2 text-amber-700">
              A troca pendente deste médico também será cancelada.
            </p>
          )}
        </>
      ),
      rotuloConfirmar: "Remover",
      perigo: true,
      acao: () => removerUsuario(u.posicao!),
    });
  }

  // u sempre tem posicao aqui: é a vaga que ele ocupa
  function celulaMedico(u: Usuario, editavel: boolean): CelulaGrade {
    const posicao = u.posicao!;
    const pendente = u.trocaPendente;
    // O titular responde quando o próprio substituto pediu a vaga; nos demais casos, o substituto
    const respondente =
      pendente &&
      (pendente.respondenteId === u.id ? (u as Pessoa) : pendente.usuarioEntrada);
    const souRespondente = respondente != null && respondente.id === meuId;

    // Trocar fica fora do modo edição e só vale com o aceite. A gestão troca qualquer vaga;
    // o médico troca a própria ou pede a de um colega para si, se não estiver no mesmo turno (aí o colega precisa aceitar)
    const acoes: AcaoMenu[] = [];
    const ehMinhaVaga = u.id === meuId;
    const podePedirVaga = podeGerirEquipe || ehMinhaVaga || !noTurno(meuId, turnoDaPosicao(posicao));
    // Com troca por horas valendo, a vaga não aceita outra troca até a gestão desfazê-la
    if (!pendente && !u.cobertura && podePedirVaga)
      acoes.push({
        rotulo: podeGerirEquipe || ehMinhaVaga ? "Trocar" : "Pedir a vaga",
        onClick: () => abrirTroca(posicao),
      });
    if (pendente && (podeGerirEquipe || pendente.solicitadoPor.id === meuId))
      acoes.push({
        rotulo: "Cancelar pedido de troca",
        perigo: true,
        onClick: () => cancelarPedidoTroca(posicao, pendente),
      });
    if (editavel && podeGerirEquipe && u.cobertura) {
      const cobertura = u.cobertura;
      acoes.push({
        rotulo: "Desfazer troca por horas",
        perigo: true,
        onClick: () => desfazerCobertura(posicao, cobertura),
      });
    }
    if (editavel && podeGerirEquipe) {
      acoes.push({
        rotulo: "Remover",
        perigo: true,
        onClick: () => confirmarRemocao(u),
      });
    }

    // A gestão muda a posição no modo edição; o médico escalado (que não entra nesse modo) muda direto
    // na visualização. Mudar de vaga é também como se define o coordenador
    const mostraSeletorPosicao = podeEditarPlantao
      ? editavel
      : podeMudarPosicao && estouEscalado;

    let rotulo: React.ReactNode = rotuloPosicaoAbreviado(plantao.data, posicao);
    if (!pendente && !u.cobertura && mostraSeletorPosicao) {
      rotulo = (
        <select
          aria-label="Vaga"
          value={posicao}
          onChange={(e) => alterarPosicao(posicao, Number(e.target.value))}
          className="w-full max-w-full bg-white text-brand-800 border border-brand-200 rounded-md text-xs px-1 py-0.5"
        >
          {TURNOS.map((t) => (
            <optgroup key={t.valor} label={t.rotulo}>
              {vagasDoTurno(t.valor, plantao.data, [posicao]).map((p) => (
                <option key={p} value={p}>
                  {rotuloPosicaoAbreviado(plantao.data, p)}
                  {p !== posicao && selecionados.some((o) => o.posicao === p)
                    ? " (trocar)"
                    : ""}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      );
    }

    return {
      tipo: "medico",
      chave: `vaga-${posicao}`,
      pessoa: u,
      rotulo,
      // Afastamento (férias/congresso) tem prioridade visual: a gestão precisa resolver essa escala
      destaque: u.afastamento && !afastamentoPendente(u.afastamento)
        ? "indisponivel"
        : pendente
          ? "pendente"
          : u.coordenador
            ? "coordenador"
            : undefined,
      status:
        u.afastamento || pendente || u.cobertura ? (
          <>
            {u.afastamento && (
              <span className="block font-semibold not-italic">
                {afastamentoPendente(u.afastamento)
                  ? `Pedido de ${rotuloAfastamento(u.afastamento)} aguardando aprovação`
                  : `Indisponível: ${rotuloAfastamento(u.afastamento)}`}
              </span>
            )}
            {u.cobertura && (
              <span className="block">
                {nomeDe(u.cobertura.usuario)} cobre{" "}
                {formatarIntervalo(u.cobertura.horaInicio, u.cobertura.horaFim)}
              </span>
            )}
            {pendente && (
              <span className="block">
                {pendente.horaInicio && pendente.horaFim
                  ? `${formatarIntervalo(pendente.horaInicio, pendente.horaFim)}: `
                  : ""}
                {souRespondente
                  ? pendente.respondenteId === u.id
                    ? `${nomeDe(pendente.usuarioEntrada)} pediu sua vaga: aguardando seu aceite`
                    : "aguardando seu aceite"
                  : `aguardando aceite de ${nomeDe(respondente!)}`}
              </span>
            )}
          </>
        ) : undefined,
      extra: souRespondente && pendente && (
        <div className="flex gap-3 text-xs">
          <button
            type="button"
            onClick={() => responderTrocaAqui(pendente.id, posicao, true)}
            className="text-green-600 hover:text-green-800 font-bold"
          >
            Aceitar
          </button>
          <button
            type="button"
            onClick={() => responderTrocaAqui(pendente.id, posicao, false)}
            className="text-red-600 hover:text-red-800 font-bold"
          >
            Recusar
          </button>
        </div>
      ),
      acoes,
    };
  }

  // Vaga livre: a gestão preenche (no modo edição) e responde aos pedidos; o médico pede a vaga
  function celulaVazia(p: number, turno: Turno, editavel: boolean): CelulaGrade {
    const base = {
      tipo: "vazia" as const,
      chave: `vaga-${p}`,
      rotulo: rotuloPosicaoAbreviado(plantao.data, p),
      texto: "Vaga livre",
      ativa: adicionando?.posicao === p,
    };
    const pendentes = pedidosVaga.filter((pd) => pd.status === "pendente" && pd.posicao === p);

    if (podeGerirEquipe) {
      return {
        ...base,
        onClick: editavel ? () => abrirAdicao({ posicao: p }) : undefined,
        destaque: pendentes.length > 0 ? "pendente" : undefined,
        extra: pendentes.length > 0 && (
          <ul className="space-y-1">
            {pendentes.map((pd) => (
              <li key={pd.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                <span className="text-amber-800">
                  <span className="font-semibold">{nomeDe(pd.usuario)}</span> pediu esta vaga
                </span>
                <span className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => responderPedidoVaga(pd, true)}
                    className="text-green-600 hover:text-green-800 font-bold"
                  >
                    Aprovar
                  </button>
                  <button
                    type="button"
                    onClick={() => responderPedidoVaga(pd, false)}
                    className="text-red-600 hover:text-red-800 font-bold"
                  >
                    Recusar
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ),
      };
    }

    if (!souMedico) return base;

    const meuPedido = pendentes.find((pd) => pd.usuario.id === meuId);
    if (meuPedido) {
      return {
        ...base,
        destaque: "pendente",
        status: "Seu pedido aguarda a aprovação da gestão",
        extra: (
          <button
            type="button"
            onClick={() => cancelarPedidoVaga(meuPedido)}
            className="text-xs font-bold text-red-600 hover:text-red-800"
          >
            Cancelar pedido
          </button>
        ),
      };
    }

    // Só antes do turno começar e se ele ainda não estiver nesse turno do plantão
    const { hora_inicio } = horarioDaVaga(plantao.data, p);
    const turnoComecou = new Date(`${plantao.data}T${hora_inicio}:00`) <= new Date();
    if (turnoComecou || noTurno(meuId, turno)) return base;

    return { ...base, acao: "Pedir esta vaga", onClick: () => pedirVaga(p) };
  }

  function montarCelulas(turno: Turno, editavel: boolean): CelulaGrade[] {
    const ocupadas = selecionados.flatMap((s) => (s.posicao != null ? [s.posicao] : []));
    return vagasDoTurno(turno, plantao.data, ocupadas).map((p): CelulaGrade => {
      const u = selecionados.find((s) => s.posicao === p);
      if (u) return celulaMedico(u, editavel);
      return celulaVazia(p, turno, editavel);
    });
  }

  // Quem já está no turno da vaga não aparece como substituto
  const resultadosTrocaFiltrados = resultadosTroca.filter(
    (r) =>
      r.id !== usuarioTrocando?.id &&
      (trocandoPosicao == null || !noTurno(r.id, turnoDaPosicao(trocandoPosicao))),
  );
  const resultadosAdicao = resultados.filter(
    (r) => !adicionando || !noTurno(r.id, turnoDaPosicao(adicionando.posicao)),
  );

  // Busca do substituto: aparece abaixo da lista do turno da vaga, na visualização e no modo edição
  const painelTroca = usuarioTrocando && horarioTrocando && (
    <div className="relative mt-3">
      <div className="flex items-center justify-between mb-1">
        <label
          htmlFor="buscaTroca"
          className="text-xs font-semibold text-brand-700"
        >
          {pedindoVagaParaMim ? "Pedir a vaga de" : "Substituir"}{" "}
          {nomeDe(usuarioTrocando)} ({descreverPosicao(plantao.data, trocandoPosicao!)})
        </label>
        <button
          type="button"
          onClick={() => abrirTroca(null)}
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          Cancelar
        </button>
      </div>
      <SeletorTrocaPorHoras
        horaInicio={horarioTrocando.hora_inicio}
        horaFim={horarioTrocando.hora_fim}
        lado={trocaParcial}
        corte={horaParcial}
        nomeTitular={nomeDe(usuarioTrocando)}
        onChange={(lado, corte) => {
          setTrocaParcial(lado);
          setHoraParcial(corte);
        }}
      />
      {pedindoVagaParaMim ? (
        <button
          type="button"
          onClick={() =>
            setConfirmacao({
              titulo: "Pedir a vaga?",
              mensagem: (
                <p>
                  Pedir a vaga de{" "}
                  <span className="font-semibold">
                    {nomeDe(usuarioTrocando)}
                  </span>{" "}
                  para você
                  {intervaloTroca
                    ? ` só das ${formatarIntervalo(intervaloTroca.horaInicio, intervaloTroca.horaFim).replace("–", " às ")}`
                    : ""}
                  . A troca só vale depois que {nomeDe(usuarioTrocando)}{" "}
                  aceitar.
                </p>
              ),
              rotuloConfirmar: "Pedir a vaga",
              acao: () =>
                solicitarTroca(trocandoPosicao!, { id: meuId ?? "" }, intervaloTroca),
            })
          }
          className="w-full bg-brand-700 hover:bg-brand-800 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
        >
          Pedir esta vaga para mim
        </button>
      ) : (
      <>
      <input
        id="buscaTroca"
        autoFocus
        type="text"
        value={buscaTroca}
        onChange={(e) => setBuscaTroca(e.target.value)}
        placeholder="Buscar médico para substituir"
        autoComplete="off"
        className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent transition"
      />

      {buscaTroca.trim() && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
          {buscandoTroca ? (
            <p className="px-4 py-2.5 text-sm text-gray-400">Buscando...</p>
          ) : resultadosTrocaFiltrados.length === 0 ? (
            <p className="px-4 py-2.5 text-sm text-gray-400">
              Nenhum médico encontrado.
            </p>
          ) : (
            resultadosTrocaFiltrados.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() =>
                  setConfirmacao({
                    titulo: "Solicitar troca?",
                    mensagem: (
                      <p>
                        Trocar{" "}
                        <span className="font-semibold">
                          {nomeDe(usuarioTrocando)}
                        </span>{" "}
                        por <span className="font-semibold">{nomeDe(r)}</span>
                        {intervaloTroca
                          ? ` só das ${formatarIntervalo(intervaloTroca.horaInicio, intervaloTroca.horaFim).replace("–", " às ")}`
                          : usuarioTrocando.coordenador
                            ? " (inclusive como coordenador)"
                            : ""}
                        . A troca só vale depois que{" "}
                        {nomeDe(r.id === meuId ? usuarioTrocando : r)} aceitar.
                      </p>
                    ),
                    rotuloConfirmar: "Solicitar troca",
                    acao: () =>
                      solicitarTroca(trocandoPosicao!, r, intervaloTroca),
                  })
                }
                disabled={!!r.afastamento}
                className="w-full flex items-center gap-2 text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
              >
                <SiglaBadge sigla={r.sigla} size="sm" />
                <span className="min-w-0 truncate">{nomeDe(r)}</span>
                {r.afastamento ? (
                  <AvisoAfastamento afastamento={r.afastamento} />
                ) : (
                  <AvisoIndisponivel
                    dias={r.dias_disponiveis}
                    data={plantao.data}
                  />
                )}
              </button>
            ))
          )}
        </div>
      )}
      </>
      )}
    </div>
  );

  const eventosHistorico: EventoHistorico[] = [
    ...historico.map((troca) => ({
      tipo: "troca" as const,
      quando: troca.solicitadoEm,
      troca,
    })),
    ...remocoes.map((remocao) => ({
      tipo: "remocao" as const,
      quando: remocao.removidoEm,
      remocao,
    })),
    ...mudancasPosicao.map((mudanca) => ({
      tipo: "posicao" as const,
      quando: mudanca.alteradoEm,
      mudanca,
    })),
    ...pedidosVaga.map((pedido) => ({
      tipo: "pedido" as const,
      quando: pedido.solicitadoEm,
      pedido,
    })),
  ].sort((a, b) => b.quando.localeCompare(a.quando));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-full overflow-y-auto p-6 sm:p-8">
        <div className="flex items-start justify-between mb-1">
          <h1 className="text-xl font-bold text-gray-800">
            {editando ? "Editar plantão" : plantao.titulo}
          </h1>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="text-gray-400 hover:text-gray-600 p-1 -mr-1 -mt-1"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {!editando && (
          <p className="text-gray-400 text-sm mb-6">
            {new Date(`${plantao.data}T00:00:00`).toLocaleDateString("pt-BR")} ·{" "}
            {TURNOS.map((t) => `${t.rotulo} ${formatarTurnoDoDia(t.valor, plantao.data)}`).join(" · ")}
          </p>
        )}

        {editando ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="titulo"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Título
              </label>
              <input
                id="titulo"
                type="text"
                required
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent transition"
              />
            </div>

            <div>
              <label
                htmlFor="descricao"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Descrição (opcional)
              </label>
              <textarea
                id="descricao"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                rows={2}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent transition"
              />
            </div>

            <div>
              <label
                htmlFor="data"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Dia
              </label>
              <input
                id="data"
                type="date"
                required
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent transition"
              />
            </div>

            <div className="space-y-4">
              {TURNOS.map((t) => (
                <div key={t.valor}>
                  <p className="block text-sm font-medium text-gray-700 mb-2">
                    {t.rotulo}{" "}
                    <span className="font-normal text-gray-400">· {formatarTurnoDoDia(t.valor, plantao.data)}</span>
                  </p>

                  <GradeParticipantes celulas={montarCelulas(t.valor, true)} />

                  {adicionando && turnoDaPosicao(adicionando.posicao) === t.valor && (
                    <div className="relative mt-3">
                      <div className="flex items-center justify-between mb-1">
                        <label
                          htmlFor="buscaUsuario"
                          className="text-xs font-semibold text-brand-700"
                        >
                          Adicionar: {descreverPosicao(plantao.data, adicionando.posicao)}
                        </label>
                        <button
                          type="button"
                          onClick={() => abrirAdicao(null)}
                          className="text-xs text-gray-400 hover:text-gray-600"
                        >
                          Cancelar
                        </button>
                      </div>
                      <input
                        id="buscaUsuario"
                        autoFocus
                        type="text"
                        value={busca}
                        onChange={(e) => setBusca(e.target.value)}
                        placeholder="Buscar por nome ou e-mail"
                        autoComplete="off"
                        className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent transition"
                      />

                      {busca.trim() && (
                        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                          {buscando ? (
                            <p className="px-4 py-2.5 text-sm text-gray-400">
                              Buscando...
                            </p>
                          ) : resultadosAdicao.length === 0 ? (
                            <p className="px-4 py-2.5 text-sm text-gray-400">
                              Nenhum médico encontrado.
                            </p>
                          ) : (
                            resultadosAdicao.map((u) => (
                                <button
                                  key={u.id}
                                  type="button"
                                  onClick={() => adicionarUsuario(u)}
                                  disabled={!!u.afastamento}
                                  className="w-full flex items-center gap-2 text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
                                >
                                  <SiglaBadge sigla={u.sigla} size="sm" />
                                  <span className="min-w-0 truncate">
                                    {nomeDe(u)}
                                  </span>
                                  {u.afastamento ? (
                                    <AvisoAfastamento afastamento={u.afastamento} />
                                  ) : (
                                    <AvisoIndisponivel
                                      dias={u.dias_disponiveis}
                                      data={plantao.data}
                                    />
                                  )}
                                </button>
                              ))
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {trocandoPosicao != null && turnoDaPosicao(trocandoPosicao) === t.valor && painelTroca}
                </div>
              ))}
            </div>

            {error && (
              <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={cancelarEdicao}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-2.5 rounded-lg text-sm transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-brand-700 hover:bg-brand-800 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? "Salvando..." : "Salvar alterações"}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            {plantao.descricao && (
              <p className="text-sm text-gray-600">{plantao.descricao}</p>
            )}

            {TURNOS.map((t) => (
              <div key={t.valor}>
                <p className="text-sm font-medium text-gray-700 mb-2">
                  {t.rotulo}{" "}
                  <span className="font-normal text-gray-400">· {formatarTurnoDoDia(t.valor, plantao.data)}</span>
                </p>
                <GradeParticipantes celulas={montarCelulas(t.valor, false)} />
                {trocandoPosicao != null && turnoDaPosicao(trocandoPosicao) === t.valor && painelTroca}
              </div>
            ))}

            {error && (
              <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            {podeEditar && podeEditarPlantao && (
              <button
                type="button"
                onClick={() => setEditando(true)}
                className="w-full bg-brand-700 hover:bg-brand-800 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
              >
                Editar
              </button>
            )}
          </div>
        )}

        {eventosHistorico.length > 0 && (
          <div className="mt-6 pt-4 border-t border-gray-100">
            <p className="text-sm font-medium text-gray-700 mb-2">
              Histórico do plantão
            </p>
            <ul className="space-y-2 max-h-40 overflow-y-auto">
              {eventosHistorico.map((evento) => {
                if (evento.tipo === "remocao") {
                  const r = evento.remocao;
                  const papel = r.eraCoordenador
                    ? " (coordenador)"
                    : r.posicao != null
                      ? ` (${descreverPosicao(plantao.data, r.posicao)})`
                      : "";
                  return (
                    <li
                      key={`remocao-${r.id}`}
                      className="flex items-start gap-2 text-xs text-gray-600"
                    >
                      <span className="mt-1 w-1.5 h-1.5 rounded-full shrink-0 bg-gray-500" />
                      <span>
                        <span className="font-semibold">
                          {nomeDe(r.removidoPor)}
                        </span>{" "}
                        removeu{" "}
                        <span className="font-semibold">
                          {nomeDe(r.usuario)}
                        </span>
                        {papel} em{" "}
                        {new Date(r.removidoEm).toLocaleString("pt-BR")}
                      </span>
                    </li>
                  );
                }

                if (evento.tipo === "posicao") {
                  const m = evento.mudanca;
                  return (
                    <li
                      key={`posicao-${m.id}`}
                      className="flex items-start gap-2 text-xs text-gray-600"
                    >
                      <span className="mt-1 w-1.5 h-1.5 rounded-full shrink-0 bg-brand-500" />
                      <span>
                        <span className="font-semibold">
                          {nomeDe(m.alteradoPor)}
                        </span>{" "}
                        {m.usuarioTrocado ? (
                          <>
                            trocou{" "}
                            <span className="font-semibold">
                              {nomeDe(m.usuario)}
                            </span>
                            {m.posicaoAnterior != null &&
                              ` (${descreverPosicao(plantao.data, m.posicaoAnterior)})`}{" "}
                            com{" "}
                            <span className="font-semibold">
                              {nomeDe(m.usuarioTrocado)}
                            </span>{" "}
                            ({descreverPosicao(plantao.data, m.posicaoNova)})
                          </>
                        ) : (
                          <>
                            moveu{" "}
                            <span className="font-semibold">
                              {nomeDe(m.usuario)}
                            </span>
                            {m.posicaoAnterior != null &&
                              ` de ${descreverPosicao(plantao.data, m.posicaoAnterior)}`}{" "}
                            para {descreverPosicao(plantao.data, m.posicaoNova)}
                          </>
                        )}{" "}
                        em {new Date(m.alteradoEm).toLocaleString("pt-BR")}
                      </span>
                    </li>
                  );
                }

                if (evento.tipo === "pedido") {
                  const pd = evento.pedido;
                  const cor = {
                    pendente: "bg-amber-400",
                    aprovado: "bg-green-500",
                    recusado: "bg-red-500",
                    cancelado: "bg-gray-400",
                  }[pd.status];
                  const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR");
                  return (
                    <li
                      key={`pedido-${pd.id}`}
                      className="flex items-start gap-2 text-xs text-gray-600"
                    >
                      <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${cor}`} />
                      <span>
                        <span className="font-semibold">{nomeDe(pd.usuario)}</span>{" "}
                        pediu a vaga ({descreverPosicao(plantao.data, pd.posicao)}) em{" "}
                        {quando(pd.solicitadoEm)}
                        {pd.status === "pendente" && " — aguardando aprovação"}
                        {pd.status !== "pendente" && pd.respondidoEm && (
                          <>
                            {" "}— {pd.status === "aprovado" ? "aprovado" : pd.status === "recusado" ? "recusado" : "cancelado"}
                            {pd.respondidoPor && pd.status !== "cancelado" && (
                              <> por <span className="font-semibold">{nomeDe(pd.respondidoPor)}</span></>
                            )}{" "}
                            em {quando(pd.respondidoEm)}
                          </>
                        )}
                      </span>
                    </li>
                  );
                }

                const t = evento.troca;
                const cor = {
                  pendente: "bg-amber-400",
                  aceita: "bg-green-500",
                  recusada: "bg-red-500",
                  cancelada: "bg-gray-400",
                }[t.status];

                return (
                  <li
                    key={`troca-${t.id}`}
                    className="flex items-start gap-2 text-xs text-gray-600"
                  >
                    <span
                      className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${cor}`}
                    />
                    <span>
                      <span className="font-semibold">
                        {nomeDe(t.solicitadoPor)}
                      </span>{" "}
                      solicitou trocar{" "}
                      <span className="font-semibold">
                        {nomeDe(t.usuarioSaida)}
                      </span>
                      {t.posicao != null && ` (${descreverPosicao(plantao.data, t.posicao)})`}{" "}
                      por{" "}
                      <span className="font-semibold">
                        {nomeDe(t.usuarioEntrada)}
                      </span>{" "}
                      {t.horaInicio && t.horaFim
                        ? `(${formatarIntervalo(t.horaInicio, t.horaFim)}) `
                        : ""}
                      em {new Date(t.solicitadoEm).toLocaleString("pt-BR")}
                      {t.status === "pendente" && " — aguardando aceite"}
                      {t.status === "aceita" && t.respondidoEm && (
                        <>
                          {" "}
                          — aceita em{" "}
                          {new Date(t.respondidoEm).toLocaleString("pt-BR")}
                        </>
                      )}
                      {t.status === "recusada" && t.respondidoEm && (
                        <>
                          {" "}
                          — recusada em{" "}
                          {new Date(t.respondidoEm).toLocaleString("pt-BR")}
                        </>
                      )}
                      {t.status === "cancelada" && t.respondidoEm && (
                        <>
                          {" "}
                          — cancelada em{" "}
                          {new Date(t.respondidoEm).toLocaleString(
                            "pt-BR",
                          )}
                        </>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {confirmacao && (
        <ConfirmacaoModal
          confirmacao={confirmacao}
          onClose={() => setConfirmacao(null)}
        />
      )}
    </div>
  );
}
