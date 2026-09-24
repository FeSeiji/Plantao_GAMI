"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import SiglaBadge from "../../../components/SiglaBadge"
import PlantaoModal from "../../../components/PlantaoModal"
import { EVENTO_TROCAS_ATUALIZADAS } from "../../../components/NotificacaoTrocaSino"
import type { Plantao } from "../../../components/PlantaoCalendario"

const ROLE_LABELS: Record<string, string> = {
  anestesita_socio: "Anestesista Sócio",
  anestesita_plantonista: "Anestesista Plantonista",
  tecnico: "Técnico",
  coordenador: "Coordenador",
  admin: "Administrador",
}

type Pessoa = { id: string; nome?: string | null; email?: string | null; sigla?: string | null }

type PlantaoResumo = {
  id: string
  titulo: string
  data: string
  hora_inicio: string
  hora_fim: string
  tipo: "plantonista" | "socio"
  emAndamento: boolean
  meuPapel: { coordenador: boolean; posicao: number | null }
  usuarios: (Pessoa & { coordenador: boolean; posicao: number | null })[]
}

type Troca = {
  id: string
  solicitadoEm: string
  plantao: { id: string; titulo: string; data: string; hora_inicio: string; hora_fim: string; tipo: string } | null
  usuarioSaida: Pessoa
  usuarioEntrada: Pessoa
  solicitadoPor: Pessoa
}

type Resumo = {
  agora: { data: string; hora: string }
  proximoPlantao: PlantaoResumo | null
  agenda: PlantaoResumo[]
  trocasParaMim: Troca[]
  trocasSolicitadas: Troca[]
  meuMes: {
    mes: string
    plantonista: { plantoes: number; minutos: number }
    socio: { plantoes: number; pontos: number }
  }
}

// Mesma lista do backend em routes/dashboard.js
const ROLES_VISAO_GESTAO = ["admin", "tecnico"]
// Só quem trabalha em plantões tem cards pessoais — admin/técnico puros veem só a gestão
const ROLES_MEDICO = ["anestesita_socio", "anestesita_plantonista"]

type PlantaoGeral = Omit<PlantaoResumo, "emAndamento" | "meuPapel">

type Gestao = {
  emAndamento: PlantaoGeral[]
  alertas: { problema: string; plantao: PlantaoGeral }[]
  trocasPendentes: { total: number; maisAntiga: Troca | null }
  mes: {
    atual: { mes: string; plantoes: number; minutos: number; pontos: number }
    anterior: { mes: string; plantoes: number; minutos: number; pontos: number }
    topHoras: (Pessoa & { minutos: number })[]
    topPontos: (Pessoa & { pontos: number })[]
  }
  equipe: { ativos: number; desativados: number; porRole: Record<string, number> }
}

function paraDataLocal(data: string) {
  const [a, m, d] = data.split("-").map(Number)
  return new Date(a, m - 1, d)
}

function formatarData(data: string) {
  return paraDataLocal(data).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })
}

function formatarHorario(p: { hora_inicio: string; hora_fim: string }) {
  return `${p.hora_inicio.slice(0, 5)}–${p.hora_fim.slice(0, 5)}`
}

function formatarHoras(minutos: number) {
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`
}

function nomeDe(p: Pessoa) {
  return p.nome ?? p.email ?? "—"
}

// Usa o "agora" do servidor (horário do hospital) para não depender do relógio do aparelho
function quandoComeca(p: PlantaoResumo, agora: Resumo["agora"]) {
  if (p.emAndamento) return "Em andamento"
  const dias = Math.round((paraDataLocal(p.data).getTime() - paraDataLocal(agora.data).getTime()) / 86400000)
  const hora = p.hora_inicio.slice(0, 5)
  if (dias === 0) return `Hoje às ${hora}`
  if (dias === 1) return `Amanhã às ${hora}`
  return `Em ${dias} dias`
}

function descreverPapel(p: PlantaoResumo) {
  if (p.tipo === "socio") return p.meuPapel.posicao != null ? `Posição ${p.meuPapel.posicao} na fila` : "Fila de sócios"
  return p.meuPapel.coordenador ? "Você é o coordenador" : "Equipe de plantonistas"
}

function tempoDesde(iso: string) {
  const horas = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000)
  if (horas < 1) return "há menos de 1h"
  if (horas < 24) return `há ${horas}h`
  const dias = Math.floor(horas / 24)
  return `há ${dias} ${dias === 1 ? "dia" : "dias"}`
}

function Variacao({ atual, anterior }: { atual: number; anterior: number }) {
  if (anterior === 0) return <span className="text-xs text-gray-400">sem dados no mês anterior</span>
  const pct = Math.round(((atual - anterior) / anterior) * 100)
  const cor = pct > 0 ? "text-green-700" : pct < 0 ? "text-red-700" : "text-gray-500"
  return (
    <span className={`text-xs font-semibold ${cor}`}>
      {pct > 0 ? "▲" : pct < 0 ? "▼" : "="} {Math.abs(pct)}% vs mês anterior
    </span>
  )
}

function Card({ titulo, children, className = "" }: { titulo: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`bg-white rounded-xl border border-gray-200 p-5 ${className}`}>
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">{titulo}</h2>
      {children}
    </section>
  )
}

function Vazio({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-400">{children}</p>
}

function Equipe({ usuarios }: { usuarios: PlantaoResumo["usuarios"] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {usuarios.map((u) => (
        <div key={u.id} className={u.coordenador ? "rounded-full ring-2 ring-purple-600" : undefined} title={nomeDe(u)}>
          <SiglaBadge sigla={u.sigla} size="sm" />
        </div>
      ))}
    </div>
  )
}

function DescricaoTroca({ troca, perspectiva }: { troca: Troca; perspectiva: "paraMim" | "solicitada" }) {
  const p = troca.plantao
  return (
    <div className="min-w-0">
      <p className="text-sm text-gray-800">
        {perspectiva === "paraMim" ? (
          <>
            Substituir <span className="font-semibold">{nomeDe(troca.usuarioSaida)}</span>
          </>
        ) : (
          <>
            <span className="font-semibold">{nomeDe(troca.usuarioEntrada)}</span> no lugar de{" "}
            <span className="font-semibold">{nomeDe(troca.usuarioSaida)}</span>
          </>
        )}
      </p>
      {p && (
        <p className="text-xs text-gray-500 truncate">
          {p.titulo} · {formatarData(p.data)} · {formatarHorario(p)}
        </p>
      )}
      {perspectiva === "paraMim" && (
        <p className="text-xs text-gray-400">Pedido por {nomeDe(troca.solicitadoPor)}</p>
      )}
    </div>
  )
}

export default function DashboardPage() {
  const router = useRouter()
  const [nome, setNome] = useState<string | null>(null)
  const [roles, setRoles] = useState<string[]>([])
  const [resumo, setResumo] = useState<Resumo | null>(null)
  const [error, setError] = useState("")
  const [respondendo, setRespondendo] = useState<string | null>(null)
  const [plantaoAberto, setPlantaoAberto] = useState<Plantao | null>(null)
  const [gestao, setGestao] = useState<Gestao | null>(null)
  const [carregado, setCarregado] = useState(false)

  const carregar = useCallback(() => {
    const token = localStorage.getItem("token")
    if (!token) return

    const buscar = (caminho: string) =>
      fetch(`${process.env.NEXT_PUBLIC_API_URL}${caminho}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? "Não foi possível carregar o dashboard.")
        return data
      })

    let roles: string[] = []
    try {
      roles = JSON.parse(localStorage.getItem("roles") ?? "[]")
    } catch {}
    const veMedico = roles.some((r) => ROLES_MEDICO.includes(r))
    const veGestao = roles.some((r) => ROLES_VISAO_GESTAO.includes(r))

    // Cada perfil só busca os painéis que vai ver; quando tem os dois, as chamadas saem juntas
    Promise.all([
      veMedico ? buscar("/dashboard") : Promise.resolve(null),
      veGestao ? buscar("/dashboard/gestao") : Promise.resolve(null),
    ])
      .then(([pessoal, visaoGestao]) => {
        setResumo(pessoal)
        setGestao(visaoGestao)
        setError("")
      })
      .catch((err) => setError(err.message))
      .finally(() => setCarregado(true))
  }, [])

  useEffect(() => {
    if (!localStorage.getItem("token")) {
      router.push("/login")
      return
    }

    setNome(localStorage.getItem("nome"))
    try {
      setRoles(JSON.parse(localStorage.getItem("roles") ?? "[]"))
    } catch {
      setRoles([])
    }
    carregar()

    // Troca respondida pelo sino ou pelo modal também atualiza os cards
    window.addEventListener(EVENTO_TROCAS_ATUALIZADAS, carregar)
    return () => window.removeEventListener(EVENTO_TROCAS_ATUALIZADAS, carregar)
  }, [router, carregar])

  async function responderTroca(id: string, aceitar: boolean) {
    const token = localStorage.getItem("token")
    setRespondendo(id)
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/plantoes/trocas/${id}/${aceitar ? "aceitar" : "recusar"}`,
        { method: "PATCH", headers: { Authorization: `Bearer ${token}` } }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Não foi possível responder a troca.")
      window.dispatchEvent(new Event(EVENTO_TROCAS_ATUALIZADAS))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível responder a troca.")
    } finally {
      setRespondendo(null)
    }
  }

  // O resumo não traz tudo que o modal precisa (descrição, trocas por slot), então busca o plantão completo
  async function abrirPlantao(id: string) {
    const token = localStorage.getItem("token")
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/plantoes/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Não foi possível abrir o plantão.")
      setPlantaoAberto(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível abrir o plantão.")
    }
  }

  const proximo = resumo?.proximoPlantao
  const mes = resumo?.meuMes
  const mostraPlantonista = !!mes && (mes.plantonista.plantoes > 0 || roles.includes("anestesita_plantonista"))
  const mostraSocio = !!mes && (mes.socio.plantoes > 0 || roles.includes("anestesita_socio"))
  const rotuloDoMes = (chave: string) =>
    paraDataLocal(`${chave}-01`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-800">Bem-vindo(a){nome ? `, ${nome}` : ""}</h1>
        {roles.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {roles.map((role) => (
              <span key={role} className="bg-brand-100 text-brand-800 text-xs font-semibold px-3 py-1 rounded-full">
                {ROLE_LABELS[role] ?? role}
              </span>
            ))}
          </div>
        )}
      </div>

      {error && (
        <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-6">{error}</p>
      )}

      {!carregado && !error && <p className="text-gray-400 text-sm">Carregando...</p>}

      {carregado && !error && !resumo && !gestao && (
        <p className="text-gray-400 text-sm">Nenhum painel disponível para o seu perfil.</p>
      )}

      {resumo && (
        <div className="grid gap-4 lg:grid-cols-3">
          {/* 1. Próximo plantão */}
          <Card titulo="Próximo plantão" className="lg:col-span-2">
            {!proximo ? (
              <Vazio>Você não tem plantões agendados.</Vazio>
            ) : (
              <button type="button" onClick={() => abrirPlantao(proximo.id)} className="w-full text-left group">
                <p
                  className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full mb-2 ${
                    proximo.emAndamento ? "bg-green-100 text-green-800" : "bg-brand-100 text-brand-800"
                  }`}
                >
                  {quandoComeca(proximo, resumo.agora)}
                </p>
                <p className="text-lg font-bold text-gray-800 group-hover:text-brand-700">{proximo.titulo}</p>
                <p className="text-sm text-gray-500 capitalize mb-3">
                  {formatarData(proximo.data)} · {formatarHorario(proximo)} ·{" "}
                  {proximo.tipo === "socio" ? "Sócio" : "Plantonista"}
                </p>
                <p className="text-sm font-medium text-gray-700 mb-2">{descreverPapel(proximo)}</p>
                <Equipe usuarios={proximo.usuarios} />
              </button>
            )}
          </Card>

          {/* 5. Meu mês */}
          <Card titulo={`Meu mês · ${rotuloDoMes(resumo.meuMes.mes)}`}>
            {!mostraPlantonista && !mostraSocio ? (
              <Vazio>Nenhum plantão neste mês.</Vazio>
            ) : (
              <div className="space-y-4">
                {mostraPlantonista && (
                  <div>
                    <p className="text-2xl font-bold text-gray-800 tabular-nums">
                      {formatarHoras(mes!.plantonista.minutos)}
                    </p>
                    <p className="text-xs text-gray-500">
                      trabalhadas como plantonista · {mes!.plantonista.plantoes}{" "}
                      {mes!.plantonista.plantoes === 1 ? "plantão" : "plantões"}
                    </p>
                  </div>
                )}
                {mostraSocio && (
                  <div>
                    <p className="text-2xl font-bold text-gray-800 tabular-nums">{mes!.socio.pontos} pts</p>
                    <p className="text-xs text-gray-500">
                      como sócio · {mes!.socio.plantoes} {mes!.socio.plantoes === 1 ? "plantão" : "plantões"}
                    </p>
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* 3. Trocas aguardando meu aceite */}
          <Card titulo="Trocas aguardando seu aceite">
            {resumo.trocasParaMim.length === 0 ? (
              <Vazio>Nenhuma troca pendente.</Vazio>
            ) : (
              <ul className="space-y-3">
                {resumo.trocasParaMim.map((t) => (
                  <li key={t.id} className="flex flex-col gap-2 border-b border-gray-100 last:border-0 pb-3 last:pb-0">
                    <DescricaoTroca troca={t} perspectiva="paraMim" />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={respondendo === t.id}
                        onClick={() => responderTroca(t.id, true)}
                        className="text-xs font-bold px-3 py-1.5 rounded-md bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50"
                      >
                        Aceitar
                      </button>
                      <button
                        type="button"
                        disabled={respondendo === t.id}
                        onClick={() => responderTroca(t.id, false)}
                        className="text-xs font-bold px-3 py-1.5 rounded-md bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
                      >
                        Recusar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* 2. Meus próximos 7 dias */}
          <Card titulo="Meus próximos 7 dias">
            {resumo.agenda.length === 0 ? (
              <Vazio>Nada agendado nos próximos 7 dias.</Vazio>
            ) : (
              <ul className="space-y-1">
                {resumo.agenda.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => abrirPlantao(p.id)}
                      className="w-full flex items-center gap-3 text-left rounded-lg px-2 py-2 -mx-2 hover:bg-gray-50"
                    >
                      <div className="w-14 shrink-0">
                        <p className="text-xs font-semibold text-gray-800 capitalize">{formatarData(p.data).split(",")[0]}</p>
                        <p className="text-xs text-gray-500">{formatarData(p.data).split(",")[1]?.trim()}</p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-800 truncate">{p.titulo}</p>
                        <p className="text-xs text-gray-500">
                          {formatarHorario(p)} · {p.tipo === "socio" ? `Sócio${p.meuPapel.posicao ? ` · P${p.meuPapel.posicao}` : ""}` : p.meuPapel.coordenador ? "Coordenador" : "Plantonista"}
                        </p>
                      </div>
                      {p.emAndamento && <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" title="Em andamento" />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/plantoes" className="inline-block mt-3 text-xs font-semibold text-brand-700 hover:text-brand-900">
              Ver calendário →
            </Link>
          </Card>

          {/* 4. Trocas que eu pedi */}
          <Card titulo="Trocas que você pediu">
            {resumo.trocasSolicitadas.length === 0 ? (
              <Vazio>Nenhuma troca aguardando resposta.</Vazio>
            ) : (
              <ul className="space-y-3">
                {resumo.trocasSolicitadas.map((t) => (
                  <li key={t.id} className="flex items-start gap-2 border-b border-gray-100 last:border-0 pb-3 last:pb-0">
                    <span className="mt-1.5 w-2 h-2 rounded-full bg-amber-400 shrink-0" title="Aguardando aceite" />
                    <DescricaoTroca troca={t} perspectiva="solicitada" />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {gestao && (
        <>
          {resumo && <h2 className="text-sm font-bold text-gray-800 mt-10 mb-4">Visão da gestão</h2>}
          <div className="grid gap-4 lg:grid-cols-3">
            {/* 6. Agora no hospital */}
            <Card titulo="Agora no hospital">
              {gestao.emAndamento.length === 0 ? (
                <Vazio>Nenhum plantão em andamento.</Vazio>
              ) : (
                <ul className="space-y-3">
                  {gestao.emAndamento.map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => abrirPlantao(p.id)} className="w-full text-left group">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                          <p className="text-sm font-medium text-gray-800 truncate group-hover:text-brand-700">{p.titulo}</p>
                        </div>
                        <p className="text-xs text-gray-500 mb-2">
                          {formatarHorario(p)} · {p.tipo === "socio" ? "Sócio" : "Plantonista"}
                        </p>
                        <Equipe usuarios={p.usuarios} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* 7. Alertas de cobertura */}
            <Card titulo="Alertas de cobertura · 7 dias">
              {gestao.alertas.length === 0 ? (
                <Vazio>Todos os plantões dos próximos 7 dias estão completos.</Vazio>
              ) : (
                <ul className="space-y-1">
                  {gestao.alertas.map(({ plantao: p, problema }) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => abrirPlantao(p.id)}
                        className="w-full flex items-start gap-2 text-left rounded-lg px-2 py-2 -mx-2 hover:bg-gray-50"
                      >
                        <span className="mt-1.5 w-2 h-2 rounded-full bg-red-500 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{p.titulo}</p>
                          <p className="text-xs text-gray-500 capitalize">
                            {formatarData(p.data)} · {formatarHorario(p)}
                          </p>
                          <p className="text-xs font-semibold text-red-700">{problema}</p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* 8. Trocas pendentes no sistema */}
            <Card titulo="Trocas pendentes no sistema">
              <p className="text-2xl font-bold text-gray-800 tabular-nums">{gestao.trocasPendentes.total}</p>
              <p className="text-xs text-gray-500 mb-3">
                aguardando aceite
              </p>
              {gestao.trocasPendentes.maisAntiga && (
                <div className="border-t border-gray-100 pt-3">
                  <p className="text-xs font-semibold text-amber-700 mb-1">
                    Mais antiga · {tempoDesde(gestao.trocasPendentes.maisAntiga.solicitadoEm)}
                  </p>
                  <DescricaoTroca troca={gestao.trocasPendentes.maisAntiga} perspectiva="solicitada" />
                </div>
              )}
            </Card>

            {/* 9. Resumo do mês */}
            <Card titulo={`Resumo do mês · ${rotuloDoMes(gestao.mes.atual.mes)}`}>
              <div className="space-y-4">
                <div>
                  <p className="text-2xl font-bold text-gray-800 tabular-nums">{gestao.mes.atual.plantoes}</p>
                  <p className="text-xs text-gray-500">plantões</p>
                  <Variacao atual={gestao.mes.atual.plantoes} anterior={gestao.mes.anterior.plantoes} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-lg font-bold text-gray-800 tabular-nums">{formatarHoras(gestao.mes.atual.minutos)}</p>
                    <p className="text-xs text-gray-500">de plantonistas</p>
                    <Variacao atual={gestao.mes.atual.minutos} anterior={gestao.mes.anterior.minutos} />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-gray-800 tabular-nums">{gestao.mes.atual.pontos} pts</p>
                    <p className="text-xs text-gray-500">de sócios</p>
                    <Variacao atual={gestao.mes.atual.pontos} anterior={gestao.mes.anterior.pontos} />
                  </div>
                </div>
              </div>
            </Card>

            {/* 10. Top 5 do mês */}
            <Card titulo="Top 5 do mês">
              <div className="grid grid-cols-2 gap-4">
                {(
                  [
                    { rotulo: "Horas", linhas: gestao.mes.topHoras.map((l) => ({ ...l, valor: formatarHoras(l.minutos) })) },
                    { rotulo: "Pontos", linhas: gestao.mes.topPontos.map((l) => ({ ...l, valor: `${l.pontos} pts` })) },
                  ] as const
                ).map((coluna) => (
                  <div key={coluna.rotulo} className="min-w-0">
                    <p className="text-xs font-semibold text-gray-400 mb-2">{coluna.rotulo}</p>
                    {coluna.linhas.length === 0 ? (
                      <Vazio>—</Vazio>
                    ) : (
                      <ol className="space-y-2">
                        {coluna.linhas.map((l) => (
                          <li key={l.id} className="flex items-center gap-2" title={nomeDe(l)}>
                            <SiglaBadge sigla={l.sigla} size="sm" />
                            <span className="text-sm font-semibold text-gray-800 tabular-nums">{l.valor}</span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                ))}
              </div>
              <Link href="/bm-financeiro" className="inline-block mt-4 text-xs font-semibold text-brand-700 hover:text-brand-900">
                Ver BM Financeiro →
              </Link>
            </Card>

            {/* 11. Equipe cadastrada */}
            <Card titulo="Equipe cadastrada">
              <p className="text-2xl font-bold text-gray-800 tabular-nums">{gestao.equipe.ativos}</p>
              <p className="text-xs text-gray-500 mb-3">
                usuários ativos
                {gestao.equipe.desativados > 0 && ` · ${gestao.equipe.desativados} desativado${gestao.equipe.desativados === 1 ? "" : "s"}`}
              </p>
              <ul className="space-y-1.5">
                {Object.entries(gestao.equipe.porRole)
                  .sort((a, b) => b[1] - a[1])
                  .map(([role, total]) => (
                    <li key={role} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">{ROLE_LABELS[role] ?? role}</span>
                      <span className="font-semibold text-gray-800 tabular-nums">{total}</span>
                    </li>
                  ))}
              </ul>
              <Link href="/usuarios" className="inline-block mt-4 text-xs font-semibold text-brand-700 hover:text-brand-900">
                Gerenciar usuários →
              </Link>
            </Card>
          </div>
        </>
      )}

      {plantaoAberto && (
        <PlantaoModal
          plantao={plantaoAberto}
          podeEditar
          onClose={() => setPlantaoAberto(null)}
          onUpdated={carregar}
        />
      )}
    </main>
  )
}
