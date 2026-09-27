"use client"

import React, { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import SiglaBadge from "../../../components/SiglaBadge"
import { INPUT_CLASS, ROLES, ROLES_ANESTESISTA, UFS } from "../../../components/UsuarioModal"
import { EVENTO_PERFIL_ATUALIZADO } from "../../../components/sessao"
import { DIAS_SEMANA } from "../../../components/disponibilidade"

type Perfil = {
  id: string
  email: string | null
  nome: string | null
  sigla: string | null
  crm: string | null
  crm_uf: string | null
  telefone: string | null
  data_nascimento: string | null
  dias_disponiveis: number[] | null
  roles: string[]
}

const TODOS_OS_DIAS = DIAS_SEMANA.map((d) => d.valor)

const ROTULO_ROLE = Object.fromEntries(ROLES.map((r) => [r.value, r.label]))

function formatarTelefone(telefone: string | null) {
  if (!telefone) return null
  const d = telefone.replace(/\D/g, "")
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return telefone
}

function formatarData(data: string | null) {
  if (!data) return null
  return new Date(`${data}T00:00:00`).toLocaleDateString("pt-BR")
}

function Campo({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">{rotulo}</dt>
      <dd className="text-sm text-gray-800">{valor ?? <span className="text-gray-400">—</span>}</dd>
    </div>
  )
}

export default function PerfilPage() {
  const router = useRouter()
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [editando, setEditando] = useState(false)

  const [nome, setNome] = useState("")
  const [sigla, setSigla] = useState("")
  const [crm, setCrm] = useState("")
  const [crmUf, setCrmUf] = useState("")
  const [telefone, setTelefone] = useState("")
  const [dataNascimento, setDataNascimento] = useState("")
  const [dias, setDias] = useState<number[]>(TODOS_OS_DIAS)

  const [error, setError] = useState("")
  const [mensagem, setMensagem] = useState("")
  const [loading, setLoading] = useState(false)

  function preencherFormulario(p: Perfil) {
    setNome(p.nome ?? "")
    setSigla(p.sigla ?? "")
    setCrm(p.crm ?? "")
    setCrmUf(p.crm_uf ?? "")
    setTelefone(p.telefone ?? "")
    setDataNascimento(p.data_nascimento ?? "")
    setDias(p.dias_disponiveis ?? TODOS_OS_DIAS)
  }

  function alternarDia(dia: number) {
    setDias((prev) => (prev.includes(dia) ? prev.filter((d) => d !== dia) : [...prev, dia]))
  }

  useEffect(() => {
    const token = localStorage.getItem("token")
    if (!token) {
      router.push("/login")
      return
    }

    fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? "Não foi possível carregar o perfil.")
        setPerfil(data)
        preencherFormulario(data)
      })
      .catch((err) => setError(err.message))
  }, [router])

  const exigeCrm = perfil?.roles.some((r) => ROLES_ANESTESISTA.includes(r)) ?? false

  function cancelarEdicao() {
    if (perfil) preencherFormulario(perfil)
    setError("")
    setEditando(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setMensagem("")

    if (exigeCrm && dias.length === 0) {
      setError("Marque ao menos um dia disponível.")
      return
    }

    setLoading(true)

    try {
      const token = localStorage.getItem("token")
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/me`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          nome,
          sigla,
          telefone: telefone || null,
          data_nascimento: dataNascimento || null,
          ...(exigeCrm
            ? { crm, crm_uf: crmUf, dias_disponiveis: dias.length === TODOS_OS_DIAS.length ? null : dias }
            : {}),
        }),
      })

      const result = await res.json()

      if (!res.ok) {
        setError(result.error ?? "Não foi possível salvar as alterações.")
        return
      }

      setPerfil(result)
      preencherFormulario(result)
      localStorage.setItem("nome", result.nome ?? "")
      localStorage.setItem("sigla", result.sigla ?? "")
      window.dispatchEvent(new Event(EVENTO_PERFIL_ATUALIZADO))
      setEditando(false)
      setMensagem("Perfil atualizado.")
    } catch {
      setError("Não foi possível conectar ao servidor.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <h1 className="text-xl font-bold text-gray-800 mb-6">Meu perfil</h1>

      {!perfil ? (
        error ? (
          <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        ) : (
          <p className="text-sm text-gray-400">Carregando...</p>
        )
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-6 sm:p-8">
          <div className="flex items-center gap-4 mb-6">
            <SiglaBadge sigla={perfil.sigla} />
            <div className="min-w-0">
              <p className="font-semibold text-gray-800 truncate">{perfil.nome || "Sem nome"}</p>
              <p className="text-sm text-gray-500 truncate">{perfil.email}</p>
            </div>
          </div>

          {editando ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-[1fr_auto] gap-4">
                <div>
                  <label htmlFor="nome" className="block text-sm font-medium text-gray-700 mb-1">
                    Nome
                  </label>
                  <input id="nome" type="text" required value={nome} onChange={(e) => setNome(e.target.value)} className={INPUT_CLASS} />
                </div>
                <div className="w-20">
                  <label htmlFor="sigla" className="block text-sm font-medium text-gray-700 mb-1">
                    Sigla
                  </label>
                  <input
                    id="sigla"
                    type="text"
                    required
                    maxLength={2}
                    value={sigla}
                    onChange={(e) => setSigla(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
                    className={`${INPUT_CLASS} text-center uppercase`}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  E-mail
                </label>
                <input id="email" type="email" disabled value={perfil.email ?? ""} className={INPUT_CLASS} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="telefone" className="block text-sm font-medium text-gray-700 mb-1">
                    Telefone (opcional)
                  </label>
                  <input
                    id="telefone"
                    type="tel"
                    inputMode="numeric"
                    maxLength={11}
                    placeholder="DDD + número"
                    value={telefone}
                    onChange={(e) => setTelefone(e.target.value.replace(/\D/g, ""))}
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label htmlFor="dataNascimento" className="block text-sm font-medium text-gray-700 mb-1">
                    Data de nascimento (opcional)
                  </label>
                  <input
                    id="dataNascimento"
                    type="date"
                    value={dataNascimento}
                    onChange={(e) => setDataNascimento(e.target.value)}
                    className={INPUT_CLASS}
                  />
                </div>
              </div>

              {exigeCrm && (
                <div className="grid grid-cols-[1fr_auto] gap-4">
                  <div>
                    <label htmlFor="crm" className="block text-sm font-medium text-gray-700 mb-1">
                      CRM
                    </label>
                    <input
                      id="crm"
                      type="text"
                      inputMode="numeric"
                      required
                      maxLength={7}
                      value={crm}
                      onChange={(e) => setCrm(e.target.value.replace(/\D/g, ""))}
                      className={INPUT_CLASS}
                    />
                  </div>
                  <div className="w-24">
                    <label htmlFor="crmUf" className="block text-sm font-medium text-gray-700 mb-1">
                      UF
                    </label>
                    <select id="crmUf" required value={crmUf} onChange={(e) => setCrmUf(e.target.value)} className={INPUT_CLASS}>
                      <option value="">--</option>
                      {UFS.map((uf) => (
                        <option key={uf} value={uf}>
                          {uf}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {exigeCrm && (
                <div>
                  <span className="block text-sm font-medium text-gray-700 mb-1">Dias disponíveis</span>
                  <div className="grid grid-cols-7 gap-1.5">
                    {DIAS_SEMANA.map((d) => (
                      <button
                        key={d.valor}
                        type="button"
                        onClick={() => alternarDia(d.valor)}
                        aria-pressed={dias.includes(d.valor)}
                        className={`py-2 rounded-lg border text-xs font-semibold transition-colors ${
                          dias.includes(d.valor)
                            ? "border-green-600 bg-green-50 text-green-800"
                            : "border-gray-200 text-gray-400 hover:border-gray-300"
                        }`}
                      >
                        {d.curto}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    Quem montar um plantão ainda pode te escalar nos outros dias, mas verá um aviso.
                  </p>
                </div>
              )}

              <p className="text-xs text-gray-400">E-mail e funções só podem ser alterados pela gestão de usuários.</p>

              {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

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
            <>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 mb-6">
                <Campo rotulo="Nome" valor={perfil.nome} />
                <Campo rotulo="Sigla" valor={perfil.sigla} />
                <Campo rotulo="E-mail" valor={perfil.email} />
                <Campo rotulo="Telefone" valor={formatarTelefone(perfil.telefone)} />
                <Campo rotulo="Data de nascimento" valor={formatarData(perfil.data_nascimento)} />
                {exigeCrm && <Campo rotulo="CRM" valor={perfil.crm ? `${perfil.crm}/${perfil.crm_uf}` : null} />}
                {exigeCrm && (
                  <div className="sm:col-span-2">
                    <Campo
                      rotulo="Dias disponíveis"
                      valor={
                        perfil.dias_disponiveis ? (
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {DIAS_SEMANA.map((d) => (
                              <span
                                key={d.valor}
                                className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                  perfil.dias_disponiveis?.includes(d.valor)
                                    ? "bg-green-100 text-green-800"
                                    : "bg-gray-100 text-gray-400 line-through"
                                }`}
                              >
                                {d.curto}
                              </span>
                            ))}
                          </div>
                        ) : (
                          "Todos os dias"
                        )
                      }
                    />
                  </div>
                )}
                <div className="sm:col-span-2">
                  <Campo
                    rotulo="Funções"
                    valor={
                      perfil.roles.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {perfil.roles.map((r) => (
                            <span key={r} className="bg-brand-100 text-brand-800 text-xs font-semibold px-2 py-0.5 rounded-full">
                              {ROTULO_ROLE[r] ?? r}
                            </span>
                          ))}
                        </div>
                      ) : null
                    }
                  />
                </div>
              </dl>

              {mensagem && (
                <p className="text-green-700 text-sm bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-4">{mensagem}</p>
              )}

              <button
                type="button"
                onClick={() => {
                  setMensagem("")
                  setEditando(true)
                }}
                className="w-full bg-brand-700 hover:bg-brand-800 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
              >
                Editar
              </button>
            </>
          )}
        </div>
      )}
    </main>
  )
}
