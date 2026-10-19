"use client"

import React, { useEffect, useRef, useState } from "react"
import SiglaBadge from "./SiglaBadge"
import ConfirmacaoModal, { Confirmacao } from "./ConfirmacaoModal"
import { INPUT_CLASS, ROLES_ANESTESISTA } from "./UsuarioModal"
import { useViewportVisivel } from "./useViewportVisivel"
import { apiFetch } from "./sessao"
import { Pessoa } from "./fichas"
import {
  CasoFora,
  Cirurgiao,
  Hospital,
  MAX_COMENTARIOS,
  MAX_TEXTO,
  RECIBOS,
  Recibo,
  anestesistasDe,
  cpfValido,
  formatarCpf,
  formatarValor,
  rotuloRecibo,
} from "./casosFora"

type Props = {
  // null = novo caso
  caso: CasoFora | null
  onClose: () => void
  onSaved: () => void
}

const LABEL_CLASS = "block text-sm font-medium text-gray-700 mb-1"

const nomeDe = (p: Pessoa) => p.nome ?? p.email ?? p.id

const semAcento = (texto: string) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

function hojeLocal() {
  return new Date().toLocaleDateString("en-CA")
}

function formatarData(data: string) {
  return new Date(`${data}T00:00:00`).toLocaleDateString("pt-BR")
}

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

export default function CasoForaModal({ caso, onClose, onSaved }: Props) {
  const viewport = useViewportVisivel()
  const criando = caso === null
  const [editando, setEditando] = useState(criando)

  const [data, setData] = useState(hojeLocal())
  const [anestesistaId, setAnestesistaId] = useState("")
  const [segundoAnestesistaId, setSegundoAnestesistaId] = useState("")
  const [escalado, setEscalado] = useState<boolean | null>(null)
  const [cirurgiao, setCirurgiao] = useState("")
  const [pacienteNome, setPacienteNome] = useState("")
  const [pacienteCpf, setPacienteCpf] = useState("")
  const [cirurgia, setCirurgia] = useState("")
  const [hospitalId, setHospitalId] = useState("")
  const [recibo, setRecibo] = useState<Recibo | "">("")
  const [valor, setValor] = useState("")
  const [comentarios, setComentarios] = useState("")

  const [anestesistas, setAnestesistas] = useState<Pessoa[]>([])
  const [hospitais, setHospitais] = useState<Hospital[]>([])
  const [cirurgioes, setCirurgioes] = useState<Cirurgiao[]>([])
  const [sugestoesAbertas, setSugestoesAbertas] = useState(false)
  const sugestoesRef = useRef<HTMLUListElement>(null)

  const [error, setError] = useState("")
  const [salvando, setSalvando] = useState(false)
  const [confirmacao, setConfirmacao] = useState<Confirmacao | null>(null)

  function preencher(c: CasoFora) {
    setData(c.data)
    setAnestesistaId(c.anestesista.id)
    setSegundoAnestesistaId(c.segundoAnestesista?.id ?? "")
    setEscalado(c.escalado)
    setCirurgiao(c.cirurgiao)
    setPacienteNome(c.paciente_nome)
    setPacienteCpf(formatarCpf(c.paciente_cpf))
    setCirurgia(c.cirurgia)
    setHospitalId(c.hospital?.id ?? "")
    setRecibo(c.recibo ?? "")
    setValor(c.valor == null ? "" : String(c.valor))
    setComentarios(c.comentarios ?? "")
  }

  useEffect(() => {
    if (caso) {
      preencher(caso)
      return
    }
    // Anestesista registrando o próprio caso já vem preenchido
    try {
      const roles: string[] = JSON.parse(localStorage.getItem("roles") ?? "[]")
      const id = localStorage.getItem("userId")
      if (id && roles.some((r) => ROLES_ANESTESISTA.includes(r))) setAnestesistaId(id)
    } catch {}
  }, [caso])

  // Listas dos dropdowns: médicos (sócios e plantonistas) e hospitais; e as sugestões de cirurgião
  useEffect(() => {
    if (!editando) return
    const params = new URLSearchParams({ role: ROLES_ANESTESISTA.join(",") })
    Promise.all([chamarApi(`/users?${params}`), chamarApi("/hospitais"), chamarApi("/cirurgioes")])
      .then(async ([resUsuarios, resHospitais, resCirurgioes]) => {
        const [usuarios, listaHospitais, listaCirurgioes] = await Promise.all([
          resUsuarios.json(),
          resHospitais.json(),
          resCirurgioes.json(),
        ])
        if (!resUsuarios.ok) throw new Error(usuarios.error ?? "Não foi possível carregar os anestesistas.")
        if (!resHospitais.ok) throw new Error(listaHospitais.error ?? "Não foi possível carregar os hospitais.")
        if (!resCirurgioes.ok) throw new Error(listaCirurgioes.error ?? "Não foi possível carregar os cirurgiões.")
        setAnestesistas([...usuarios].sort((a: Pessoa, b: Pessoa) => nomeDe(a).localeCompare(nomeDe(b), "pt-BR")))
        setHospitais(listaHospitais)
        setCirurgioes(listaCirurgioes)
      })
      .catch((err) => setError(err.message))
  }, [editando])

  // No celular o teclado encolhe o modal: rola até a lista de sugestões para ela não ficar escondida
  useEffect(() => {
    if (sugestoesAbertas) sugestoesRef.current?.scrollIntoView({ block: "nearest" })
  }, [sugestoesAbertas, viewport?.altura])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (!anestesistaId) return setError("Escolha o anestesista.")
    if (segundoAnestesistaId === anestesistaId) return setError("Escolha dois anestesistas diferentes.")
    if (escalado === null) return setError("Informe se o anestesista estava escalado.")
    if (!cpfValido(pacienteCpf)) return setError("CPF do paciente inválido.")

    setSalvando(true)
    try {
      const corpo = {
        data,
        anestesista_id: anestesistaId,
        segundo_anestesista_id: segundoAnestesistaId || null,
        escalado,
        cirurgiao: cirurgiao.trim(),
        paciente_nome: pacienteNome.trim(),
        paciente_cpf: pacienteCpf.replace(/\D/g, ""),
        cirurgia: cirurgia.trim(),
        hospital_id: hospitalId || null,
        recibo: recibo || null,
        valor: valor === "" ? null : Number(valor),
        comentarios: comentarios.trim() || null,
      }
      const res = await chamarApi(criando ? "/casos-fora" : `/casos-fora/${caso.id}`, criando ? "POST" : "PATCH", corpo)
      const result = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(result.error ?? "Não foi possível salvar o caso.")
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar o caso.")
    } finally {
      setSalvando(false)
    }
  }

  function confirmarExclusao() {
    if (!caso) return
    setConfirmacao({
      titulo: "Excluir caso?",
      mensagem: <p>O caso de {caso.paciente_nome} será apagado. Não dá para desfazer.</p>,
      rotuloConfirmar: "Excluir",
      perigo: true,
      acao: async () => {
        const res = await chamarApi(`/casos-fora/${caso.id}`, "DELETE")
        if (!res.ok) {
          const result = await res.json().catch(() => ({}))
          setError(result.error ?? "Não foi possível excluir o caso.")
          return
        }
        onSaved()
        onClose()
      },
    })
  }

  const titulo = criando ? "Novo caso fora" : editando ? "Editar caso fora" : "Caso fora"

  // Hospital desativado depois do registro continua aparecendo no caso que já o usava
  const opcoesHospital = hospitais.filter((h) => h.ativo || h.id === hospitalId)
  // Sugestões de cirurgião: os ativos que contêm o que foi digitado, sem diferenciar acento nem maiúsculas
  const termoCirurgiao = semAcento(cirurgiao.trim())
  const sugestoesCirurgiao = cirurgioes.filter((c) => {
    const nome = semAcento(c.nome ?? "")
    return c.ativo && nome.includes(termoCirurgiao) && nome !== termoCirurgiao
  })
  // Médico que deixou de ser anestesista continua aparecendo no caso antigo
  const antigos = caso ? anestesistasDe(caso).filter((p) => !anestesistas.some((a) => a.id === p.id)) : []
  const opcoesAnestesista = [...antigos, ...anestesistas]

  const formulario = (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="casoData" className={LABEL_CLASS}>
            Data
          </label>
          <input id="casoData" type="date" required value={data} onChange={(e) => setData(e.target.value)} className={INPUT_CLASS} />
        </div>
        <div>
          <p className={LABEL_CLASS}>Escalado</p>
          <div role="radiogroup" aria-label="Escalado" className="grid grid-cols-2 gap-2">
            {[
              { valor: true, rotulo: "Sim" },
              { valor: false, rotulo: "Não" },
            ].map((opcao) => (
              <button
                key={opcao.rotulo}
                type="button"
                role="radio"
                aria-checked={escalado === opcao.valor}
                onClick={() => setEscalado(opcao.valor)}
                className={`border rounded-lg py-2.5 text-sm font-semibold transition-colors ${
                  escalado === opcao.valor
                    ? "border-brand-700 bg-brand-50 text-brand-800"
                    : "border-gray-300 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {opcao.rotulo}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="casoAnestesista" className={LABEL_CLASS}>
            Anestesista
          </label>
          <select
            id="casoAnestesista"
            required
            value={anestesistaId}
            onChange={(e) => setAnestesistaId(e.target.value)}
            className={INPUT_CLASS}
          >
            <option value="">Escolher</option>
            {opcoesAnestesista.map((a) => (
              <option key={a.id} value={a.id}>
                {nomeDe(a)}
                {a.sigla ? ` (${a.sigla})` : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="casoSegundoAnestesista" className={LABEL_CLASS}>
            2º anestesista <span className="font-normal text-gray-400">(opcional)</span>
          </label>
          <select
            id="casoSegundoAnestesista"
            value={segundoAnestesistaId}
            onChange={(e) => setSegundoAnestesistaId(e.target.value)}
            className={INPUT_CLASS}
          >
            <option value="">Nenhum</option>
            {opcoesAnestesista
              .filter((a) => a.id !== anestesistaId)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {nomeDe(a)}
                  {a.sigla ? ` (${a.sigla})` : ""}
                </option>
              ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="casoCirurgiao" className={LABEL_CLASS}>
          Cirurgião
        </label>
        {/* Sugestões feitas aqui e não com <datalist>: no celular a lista nativa aparecia fora do lugar
            (o modal é deslocado para caber acima do teclado). Aceita qualquer nome; quem liga o caso
            ao cirurgião da lista é o backend, comparando o nome */}
        <input
          id="casoCirurgiao"
          type="text"
          required
          autoComplete="off"
          maxLength={MAX_TEXTO}
          value={cirurgiao}
          onChange={(e) => {
            setCirurgiao(e.target.value)
            setSugestoesAbertas(true)
          }}
          onFocus={() => setSugestoesAbertas(true)}
          onBlur={() => setSugestoesAbertas(false)}
          className={INPUT_CLASS}
        />
        {sugestoesAbertas && sugestoesCirurgiao.length > 0 && (
          // preventDefault no mousedown: o toque na lista não tira o foco do campo, senão o onBlur
          // fecharia a lista antes do clique na sugestão
          <ul
            ref={sugestoesRef}
            onMouseDown={(e) => e.preventDefault()}
            className="mt-1 max-h-48 overflow-y-auto overscroll-contain border border-gray-200 rounded-lg divide-y divide-gray-100"
          >
            {sugestoesCirurgiao.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    setCirurgiao(c.nome ?? "")
                    setSugestoesAbertas(false)
                  }}
                  className="w-full text-left px-3 py-2.5 text-sm text-gray-800 hover:bg-gray-50 active:bg-gray-100"
                >
                  {c.nome}
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-gray-400 mt-1">Escolha da lista ou digite o nome, se ele não estiver nela.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_11rem] gap-4">
        <div>
          <label htmlFor="casoPaciente" className={LABEL_CLASS}>
            Nome completo do paciente
          </label>
          <input
            id="casoPaciente"
            type="text"
            required
            maxLength={MAX_TEXTO}
            value={pacienteNome}
            onChange={(e) => setPacienteNome(e.target.value)}
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <label htmlFor="casoCpf" className={LABEL_CLASS}>
            CPF do paciente
          </label>
          <input
            id="casoCpf"
            type="text"
            inputMode="numeric"
            required
            value={pacienteCpf}
            onChange={(e) => setPacienteCpf(formatarCpf(e.target.value))}
            placeholder="000.000.000-00"
            className={INPUT_CLASS}
          />
        </div>
      </div>

      <div>
        <label htmlFor="casoCirurgia" className={LABEL_CLASS}>
          Cirurgia realizada
        </label>
        <input
          id="casoCirurgia"
          type="text"
          required
          maxLength={MAX_TEXTO}
          value={cirurgia}
          onChange={(e) => setCirurgia(e.target.value)}
          className={INPUT_CLASS}
        />
      </div>

      <div>
        <label htmlFor="casoHospital" className={LABEL_CLASS}>
          Hospital <span className="font-normal text-gray-400">(opcional)</span>
        </label>
        <select id="casoHospital" value={hospitalId} onChange={(e) => setHospitalId(e.target.value)} className={INPUT_CLASS}>
          <option value="">—</option>
          {opcoesHospital.map((h) => (
            <option key={h.id} value={h.id}>
              {h.nome}
              {h.ativo ? "" : " (desativado)"}
            </option>
          ))}
        </select>
        <p className="text-xs text-gray-400 mt-1">Hospital fora da lista? Peça para a gestão cadastrá-lo.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="casoRecibo" className={LABEL_CLASS}>
            Recibo <span className="font-normal text-gray-400">(opcional)</span>
          </label>
          <select id="casoRecibo" value={recibo} onChange={(e) => setRecibo(e.target.value as Recibo | "")} className={INPUT_CLASS}>
            <option value="">—</option>
            {RECIBOS.map((r) => (
              <option key={r.valor} value={r.valor}>
                {r.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="casoValor" className={LABEL_CLASS}>
            Valor (R$) <span className="font-normal text-gray-400">(opcional)</span>
          </label>
          <input
            id="casoValor"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="0,00"
            className={INPUT_CLASS}
          />
        </div>
      </div>

      <div>
        <label htmlFor="casoComentarios" className={LABEL_CLASS}>
          Comentários <span className="font-normal text-gray-400">(opcional)</span>
        </label>
        <textarea
          id="casoComentarios"
          rows={3}
          maxLength={MAX_COMENTARIOS}
          value={comentarios}
          onChange={(e) => setComentarios(e.target.value)}
          className={`${INPUT_CLASS} resize-y`}
        />
        <p className="text-right text-[10px] text-gray-400">
          {comentarios.length}/{MAX_COMENTARIOS}
        </p>
      </div>
    </div>
  )

  const visualizacao = caso && (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
      <Campo rotulo="Data">{formatarData(caso.data)}</Campo>
      <Campo rotulo="Escalado">{caso.escalado ? "Sim" : "Não"}</Campo>
      <Campo rotulo={caso.segundoAnestesista ? "Anestesistas" : "Anestesista"} largo>
        <span className="flex flex-col gap-1.5">
          {anestesistasDe(caso).map((a) => (
            <span key={a.id} className="flex items-center gap-2">
              <SiglaBadge sigla={a.sigla} size="sm" />
              {nomeDe(a)}
            </span>
          ))}
        </span>
      </Campo>
      <Campo rotulo="Cirurgião" largo>
        {caso.cirurgiao}
      </Campo>
      <Campo rotulo="Paciente">{caso.paciente_nome}</Campo>
      <Campo rotulo="CPF do paciente">{formatarCpf(caso.paciente_cpf)}</Campo>
      <Campo rotulo="Cirurgia realizada" largo>
        {caso.cirurgia}
      </Campo>
      <Campo rotulo="Hospital">{caso.hospital?.nome ?? "—"}</Campo>
      <Campo rotulo="Recibo">{rotuloRecibo(caso.recibo) || "—"}</Campo>
      <Campo rotulo="Valor">{formatarValor(caso.valor)}</Campo>
      <Campo rotulo="Comentários" largo>
        {caso.comentarios ? (
          <span className="whitespace-pre-wrap break-words">{caso.comentarios}</span>
        ) : (
          <span className="italic text-gray-400">Sem comentários</span>
        )}
      </Campo>
    </dl>
  )

  return (
    <div
      className="fixed inset-x-0 top-0 z-50 flex sm:items-center justify-center sm:px-4 sm:py-8"
      style={{ height: viewport ? viewport.altura : "100dvh", transform: viewport ? `translateY(${viewport.topo}px)` : undefined }}
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative bg-white sm:rounded-2xl shadow-xl w-full sm:max-w-xl h-full sm:h-auto sm:max-h-full flex flex-col">
        <div className="shrink-0 flex items-start justify-between gap-3 px-5 sm:px-8 pt-5 sm:pt-6 pb-4">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-800">{titulo}</h1>
            {caso && (
              <p className="text-xs text-gray-400 mt-1 leading-snug">
                Registrado por {nomeDe(caso.criadoPor)} em {new Date(caso.criadoEm).toLocaleString("pt-BR")}
                {caso.atualizadoPor && caso.atualizadoEm && (
                  <span className="block">
                    Editado por {nomeDe(caso.atualizadoPor)} em {new Date(caso.atualizadoEm).toLocaleString("pt-BR")}
                  </span>
                )}
              </p>
            )}
          </div>
          <button onClick={onClose} aria-label="Fechar" className="text-gray-400 hover:text-gray-600 p-1 -mr-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form onSubmit={salvar} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 sm:px-8 pb-4 space-y-4">
            {editando ? formulario : visualizacao}
            {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          </div>

          {/* As chaves fazem o React trocar os botões em vez de reaproveitá-los: sem isso, o "Editar"
              vira o "Salvar" no meio do clique e o formulário é enviado na hora */}
          {!editando ? (
            caso?.podeEditar && (
              <div key="acoes-visualizacao" className="shrink-0 flex gap-3 px-5 sm:px-8 py-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={confirmarExclusao}
                  className="flex-1 border border-red-200 bg-white text-red-600 hover:bg-red-50 font-semibold py-2.5 rounded-lg text-sm transition-colors"
                >
                  Excluir
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    setEditando(true)
                  }}
                  className="flex-1 bg-brand-700 hover:bg-brand-800 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
                >
                  Editar
                </button>
              </div>
            )
          ) : (
            <div key="acoes-edicao" className="shrink-0 flex gap-3 px-5 sm:px-8 py-4 border-t border-gray-200">
              <button
                type="button"
                onClick={() => {
                  if (!caso) return onClose()
                  preencher(caso)
                  setError("")
                  setEditando(false)
                }}
                className="flex-1 border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 font-semibold py-2.5 rounded-lg text-sm transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={salvando}
                className="flex-1 bg-brand-700 hover:bg-brand-800 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60"
              >
                {salvando ? "Salvando..." : "Salvar"}
              </button>
            </div>
          )}
        </form>
      </div>

      {confirmacao && <ConfirmacaoModal confirmacao={confirmacao} onClose={() => setConfirmacao(null)} />}
    </div>
  )
}

function Campo({ rotulo, largo = false, children }: { rotulo: string; largo?: boolean; children: React.ReactNode }) {
  return (
    <div className={largo ? "sm:col-span-2" : ""}>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-0.5">{rotulo}</dt>
      <dd className="text-gray-900">{children}</dd>
    </div>
  )
}
