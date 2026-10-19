"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import SiglaBadge from "../../../components/SiglaBadge"
import ConfirmacaoModal, { Confirmacao } from "../../../components/ConfirmacaoModal"
import { EVENTO_TROCAS_ATUALIZADAS } from "../../../components/NotificacaoTrocaSino"
import { ROLES_EDICAO } from "../../../components/UsuarioModal"
import { TIPOS_CONGRESSO, TipoCongresso } from "../../../components/disponibilidade"
import { apiFetch } from "../../../components/sessao"

// Férias e congressos de todos os médicos: gestão (escritório, admin e técnico) — mesma lista do
// requireRole em Backend/src/routes/afastamentos.js

type Status = "pendente" | "aprovado" | "recusado"

type Afastamento = {
  id: string
  tipo: "ferias" | "congresso"
  congresso_tipo: TipoCongresso | null
  data_inicio: string
  data_fim: string
  observacao: string | null
  status: Status
  usuario: { id: string; nome?: string | null; email?: string | null; sigla?: string | null }
}

// "" = aprovados e pendentes (o padrão do backend)
const FILTROS_STATUS: { valor: Status | ""; rotulo: string }[] = [
  { valor: "", rotulo: "Aprovados e pendentes" },
  { valor: "pendente", rotulo: "Pendentes" },
  { valor: "aprovado", rotulo: "Aprovados" },
  { valor: "recusado", rotulo: "Recusados" },
]

const ROTULO_STATUS: Record<Status, { texto: string; classe: string }> = {
  pendente: { texto: "Aguardando aprovação", classe: "bg-amber-50 text-amber-800" },
  aprovado: { texto: "Aprovado", classe: "bg-green-50 text-green-700" },
  recusado: { texto: "Recusado", classe: "bg-gray-100 text-gray-600" },
}

const FILTRO_CLASS =
  "border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent transition bg-white"

const nomeDe = (p: Afastamento["usuario"]) => p.nome ?? p.email ?? p.id

function hojeLocal() {
  return new Date().toLocaleDateString("en-CA")
}

function formatarData(data: string) {
  return new Date(`${data}T00:00:00`).toLocaleDateString("pt-BR")
}

// Dias corridos, contando o primeiro e o último
function diasDoPeriodo(a: Afastamento) {
  const ms = Date.parse(`${a.data_fim}T00:00:00Z`) - Date.parse(`${a.data_inicio}T00:00:00Z`)
  return Math.round(ms / 86400000) + 1
}

const semAcento = (texto: string) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

function chamarApi(caminho: string, metodo = "GET", body?: unknown) {
  const token = localStorage.getItem("token")
  return apiFetch(`${process.env.NEXT_PUBLIC_API_URL}${caminho}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
}

export default function AfastamentosPage() {
  const router = useRouter()
  const [autorizado, setAutorizado] = useState(false)
  const [afastamentos, setAfastamentos] = useState<Afastamento[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [confirmacao, setConfirmacao] = useState<Confirmacao | null>(null)

  const [inicio, setInicio] = useState(hojeLocal)
  const [fim, setFim] = useState("")
  const [tipo, setTipo] = useState<"" | "ferias" | "congresso">("")
  const [status, setStatus] = useState<Status | "">("")
  const [busca, setBusca] = useState("")

  useEffect(() => {
    if (!localStorage.getItem("token")) {
      router.push("/login")
      return
    }
    try {
      const roles: string[] = JSON.parse(localStorage.getItem("roles") ?? "[]")
      if (!roles.some((r) => ROLES_EDICAO.includes(r))) {
        router.push("/dashboard")
        return
      }
    } catch {
      router.push("/dashboard")
      return
    }
    setAutorizado(true)
  }, [router])

  const carregar = useCallback(() => {
    if (!autorizado) return
    setLoading(true)
    const params = new URLSearchParams()
    if (inicio) params.set("inicio", inicio)
    if (fim) params.set("fim", fim)
    if (tipo) params.set("tipo", tipo)
    if (status) params.set("status", status)
    chamarApi(`/afastamentos?${params}`)
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? "Não foi possível carregar férias e congressos.")
        setAfastamentos(data)
        setError("")
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [autorizado, inicio, fim, tipo, status])

  useEffect(() => {
    carregar()
  }, [carregar])

  // O filtro de médico é feito aqui mesmo, pelo nome ou pela sigla
  const visiveis = useMemo(() => {
    const termo = semAcento(busca.trim())
    if (!termo) return afastamentos
    return afastamentos.filter((a) =>
      [a.usuario.nome, a.usuario.sigla, a.usuario.email].some((v) => v && semAcento(v).includes(termo)),
    )
  }, [afastamentos, busca])

  async function executar(id: string, acao: () => Promise<Response>, mensagemErro: string) {
    setError("")
    setOcupado(id)
    try {
      const res = await acao()
      if (!res.ok) {
        const result = await res.json().catch(() => ({}))
        throw new Error(result.error ?? mensagemErro)
      }
      carregar()
      // O sino conta os pedidos pendentes
      window.dispatchEvent(new Event(EVENTO_TROCAS_ATUALIZADAS))
    } catch (err) {
      setError(err instanceof Error ? err.message : mensagemErro)
    } finally {
      setOcupado(null)
    }
  }

  const responder = (a: Afastamento, aprovar: boolean) =>
    executar(a.id, () => chamarApi(`/afastamentos/${a.id}/${aprovar ? "aprovar" : "recusar"}`, "PATCH"), "Não foi possível responder o pedido.")

  const definirTipoCongresso = (a: Afastamento, novo: TipoCongresso) =>
    executar(a.id, () => chamarApi(`/afastamentos/${a.id}/tipo-congresso`, "PATCH", { congresso_tipo: novo }), "Não foi possível salvar o tipo do congresso.")

  function confirmarRemocao(a: Afastamento) {
    setConfirmacao({
      titulo: "Remover período?",
      mensagem: (
        <p>
          {a.tipo === "ferias" ? "Férias" : "Congresso"} de <span className="font-semibold">{nomeDe(a.usuario)}</span> de{" "}
          {formatarData(a.data_inicio)} a {formatarData(a.data_fim)}. Os plantões desse período voltam a contar normalmente.
        </p>
      ),
      rotuloConfirmar: "Remover",
      perigo: true,
      acao: () => executar(a.id, () => chamarApi(`/afastamentos/${a.id}`, "DELETE"), "Não foi possível remover o período."),
    })
  }

  function seletorTipoCongresso(a: Afastamento) {
    if (a.tipo !== "congresso") return null
    return (
      <select
        aria-label="Tipo do congresso"
        value={a.congresso_tipo ?? ""}
        disabled={ocupado === a.id}
        onChange={(e) => definirTipoCongresso(a, e.target.value as TipoCongresso)}
        className={`block mt-1.5 text-xs border rounded-md px-1.5 py-0.5 bg-white disabled:opacity-50 ${
          a.congresso_tipo ? "border-gray-300 text-gray-700" : "border-amber-300 text-amber-800"
        }`}
      >
        {!a.congresso_tipo && <option value="">Definir tipo</option>}
        {TIPOS_CONGRESSO.map((t) => (
          <option key={t.valor} value={t.valor}>
            {t.rotulo}
          </option>
        ))}
      </select>
    )
  }

  function acoes(a: Afastamento) {
    return (
      <>
        {a.status === "pendente" && (
          <>
            <button
              type="button"
              disabled={ocupado === a.id}
              onClick={() => responder(a, true)}
              className="text-xs font-semibold text-green-700 hover:text-green-900 disabled:opacity-50"
            >
              Aprovar
            </button>
            <button
              type="button"
              disabled={ocupado === a.id}
              onClick={() => responder(a, false)}
              className="text-xs font-semibold text-gray-600 hover:text-gray-800 disabled:opacity-50"
            >
              Recusar
            </button>
          </>
        )}
        <button
          type="button"
          disabled={ocupado === a.id}
          onClick={() => confirmarRemocao(a)}
          className="text-xs font-semibold text-red-600 hover:text-red-800 disabled:opacity-50"
        >
          Remover
        </button>
      </>
    )
  }

  const seloStatus = (a: Afastamento) => (
    <span className={`shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${ROTULO_STATUS[a.status].classe}`}>
      {ROTULO_STATUS[a.status].texto}
    </span>
  )

  const seloTipo = (a: Afastamento) => (
    <span className="text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded bg-red-50 text-red-700">
      {a.tipo === "ferias" ? "Férias" : "Congresso"}
    </span>
  )

  if (!autorizado) return null

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <h1 className="text-xl font-bold text-gray-800 mb-4">Férias e congressos</h1>

      <div className="flex flex-wrap items-end gap-3 mb-6">
        <div>
          <label htmlFor="filtroInicio" className="block text-xs font-medium text-gray-500 mb-1">
            De
          </label>
          <input id="filtroInicio" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className={FILTRO_CLASS} />
        </div>
        <div>
          <label htmlFor="filtroFim" className="block text-xs font-medium text-gray-500 mb-1">
            Até
          </label>
          <input id="filtroFim" type="date" value={fim} min={inicio || undefined} onChange={(e) => setFim(e.target.value)} className={FILTRO_CLASS} />
        </div>
        <div>
          <label htmlFor="filtroTipo" className="block text-xs font-medium text-gray-500 mb-1">
            Tipo
          </label>
          <select id="filtroTipo" value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)} className={FILTRO_CLASS}>
            <option value="">Férias e congressos</option>
            <option value="ferias">Férias</option>
            <option value="congresso">Congressos</option>
          </select>
        </div>
        <div>
          <label htmlFor="filtroStatus" className="block text-xs font-medium text-gray-500 mb-1">
            Status
          </label>
          <select id="filtroStatus" value={status} onChange={(e) => setStatus(e.target.value as Status | "")} className={FILTRO_CLASS}>
            {FILTROS_STATUS.map((s) => (
              <option key={s.valor} value={s.valor}>
                {s.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[12rem]">
          <label htmlFor="filtroMedico" className="block text-xs font-medium text-gray-500 mb-1">
            Médico
          </label>
          <input
            id="filtroMedico"
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Nome ou sigla"
            className={`${FILTRO_CLASS} w-full`}
          />
        </div>
      </div>

      {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-6">{error}</p>}

      {/* Até 1280px (o menu lateral ocupa espaço a partir do md), um cartão por período; depois, a tabela */}
      <ul className={`xl:hidden space-y-3 ${loading ? "opacity-60" : ""} transition-opacity`}>
        {visiveis.map((a) => (
          <li key={a.id} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-start gap-2">
              <SiglaBadge sigla={a.usuario.sigla} size="sm" />
              <p className="flex-1 min-w-0 text-sm font-medium text-gray-800 truncate">{nomeDe(a.usuario)}</p>
              {seloStatus(a)}
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2 text-sm text-gray-700">
              {seloTipo(a)}
              <span>
                {formatarData(a.data_inicio)}
                {a.data_fim !== a.data_inicio && ` a ${formatarData(a.data_fim)}`}
              </span>
              <span className="text-xs text-gray-500">
                ({diasDoPeriodo(a)} {diasDoPeriodo(a) === 1 ? "dia" : "dias"})
              </span>
            </div>
            {seletorTipoCongresso(a)}
            {a.observacao && <p className="text-xs text-gray-500 mt-1.5">{a.observacao}</p>}
            <div className="flex justify-end gap-4 mt-3 pt-3 border-t border-gray-100">{acoes(a)}</div>
          </li>
        ))}
        {!loading && visiveis.length === 0 && (
          <li className="bg-white rounded-xl border border-gray-200 px-4 py-8 text-center text-sm text-gray-400">
            Nenhuma férias ou congresso nesse período.
          </li>
        )}
      </ul>

      <div className={`hidden xl:block bg-white rounded-xl border border-gray-200 overflow-x-auto ${loading ? "opacity-60" : ""} transition-opacity`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-200">
              <th className="px-4 py-3">Médico</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Período</th>
              <th className="px-4 py-3 text-right">Dias</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((a) => (
              <tr key={a.id} className="border-b border-gray-100 last:border-0 align-top">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <SiglaBadge sigla={a.usuario.sigla} size="sm" />
                    <div className="min-w-0">
                      <p className="text-gray-800 truncate">{nomeDe(a.usuario)}</p>
                    </div>
                  </div>
                  {a.observacao && <p className="text-xs text-gray-500 mt-1 truncate">{a.observacao}</p>}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {seloTipo(a)}
                  {seletorTipoCongresso(a)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                  {formatarData(a.data_inicio)}
                  {a.data_fim !== a.data_inicio && <span className="block text-xs text-gray-500">a {formatarData(a.data_fim)}</span>}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-700">{diasDoPeriodo(a)}</td>
                <td className="px-4 py-3">{seloStatus(a)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-3">{acoes(a)}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && visiveis.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-gray-400">Nenhuma férias ou congresso nesse período.</p>
        )}
      </div>

      {confirmacao && <ConfirmacaoModal confirmacao={confirmacao} onClose={() => setConfirmacao(null)} />}
    </main>
  )
}
