"use client"

import React, { useEffect, useState } from "react"
import { INPUT_CLASS } from "./UsuarioModal"
import { apiFetch } from "./sessao"
import { LinhaExportacao } from "./fichas"

type Props = {
  // A gestão exporta todas as fichas do período; o médico, só as linhas em que é o anestesista
  ehGestao: boolean
  onClose: () => void
}

// Colunas na ordem e com os nomes do modelo do faturamento. A ficha só preenche data, hora e anestesista;
// as outras ficam vazias para o faturamento completar à mão antes de importar no outro sistema
const COLUNAS: { header: string; key: string; width: number }[] = [
  { header: "Data", key: "data", width: 10 },
  { header: "Hora", key: "hora", width: 10 },
  { header: "Número de Atendimento", key: "numero_atendimento", width: 22 },
  { header: "Autorização/Senha", key: "autorizacao", width: 18 },
  { header: "Paciente", key: "paciente", width: 30 },
  { header: "Cpf Paciente", key: "paciente_cpf", width: 14 },
  { header: "Sexo Paciente", key: "paciente_sexo", width: 13 },
  { header: "Data Nascimento Paciente", key: "paciente_nascimento", width: 23 },
  { header: "Crm Anestesista", key: "anestesista_crm", width: 15 },
  { header: "Anestesista", key: "anestesista", width: 28 },
  { header: "Crm Cirurgião", key: "cirurgiao_crm", width: 14 },
  { header: "Cirurgião", key: "cirurgiao", width: 28 },
  { header: "Cnpj Convênio", key: "convenio_cnpj", width: 16 },
  { header: "Convênio", key: "convenio", width: 24 },
  { header: "Cnpj Hospital", key: "hospital_cnpj", width: 16 },
  { header: "Hospital", key: "hospital", width: 24 },
  { header: "Código Procedimento", key: "procedimento_codigo", width: 20 },
  { header: "Nome Procedimento", key: "procedimento_nome", width: 30 },
]

// "2018-11-23" -> "23/11/18", como no modelo
const dataCurta = (data: string | null) => (data ? `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(2, 4)}` : "")
// "2026-10-01" -> "01-10-2026", para o nome do arquivo
const dataArquivo = (data: string) => data.split("-").reverse().join("-")

function mesAtual() {
  const hoje = new Date()
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
  const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)
  return { inicio: inicio.toLocaleDateString("en-CA"), fim: fim.toLocaleDateString("en-CA") }
}

// Gera o .xlsx no navegador; o exceljs só é baixado quando alguém exporta
async function baixarPlanilha(linhas: LinhaExportacao[], inicio: string, fim: string) {
  const { Workbook } = await import("exceljs")
  const workbook = new Workbook()
  const aba = workbook.addWorksheet("Fichas")
  aba.columns = COLUNAS
  // Tudo como texto, no formato do modelo (data dd/mm/aa, hora hh:mm:ss)
  for (const l of linhas) {
    aba.addRow({ ...l, data: dataCurta(l.data) })
  }
  aba.getRow(1).font = { bold: true }

  const buffer = await workbook.xlsx.writeBuffer()
  const url = URL.createObjectURL(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
  )
  const link = document.createElement("a")
  link.href = url
  link.download = `Fichas anestésicas ${dataArquivo(inicio)} a ${dataArquivo(fim)}.xlsx`
  link.click()
  URL.revokeObjectURL(url)
}

export default function ExportarFichasModal({ ehGestao, onClose }: Props) {
  const [inicio, setInicio] = useState(() => mesAtual().inicio)
  const [fim, setFim] = useState(() => mesAtual().fim)
  const [exportando, setExportando] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  async function exportar(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (fim < inicio) return setError("A data final não pode ser antes da inicial.")

    setExportando(true)
    try {
      const token = localStorage.getItem("token")
      const params = new URLSearchParams({ inicio, fim })
      const res = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/fichas/exportar?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const result = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(result.error ?? "Não foi possível exportar as fichas.")
      if (result.length === 0) throw new Error("Nenhuma ficha nesse período.")
      await baixarPlanilha(result, inicio, fim)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível exportar as fichas.")
    } finally {
      setExportando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <form onSubmit={exportar} className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6 sm:p-8 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Exportar fichas</h1>
            <p className="text-gray-400 text-sm mt-1">
              {ehGestao
                ? "Planilha com todas as fichas do período, uma linha por anestesista."
                : "Planilha com as suas fichas do período."}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="text-gray-400 hover:text-gray-600 p-1 -mr-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="exportarInicio" className="block text-sm font-medium text-gray-700 mb-1">
              De
            </label>
            <input id="exportarInicio" type="date" required value={inicio} onChange={(e) => setInicio(e.target.value)} className={INPUT_CLASS} />
          </div>
          <div>
            <label htmlFor="exportarFim" className="block text-sm font-medium text-gray-700 mb-1">
              Até
            </label>
            <input id="exportarFim" type="date" required min={inicio} value={fim} onChange={(e) => setFim(e.target.value)} className={INPUT_CLASS} />
          </div>
        </div>

        {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 font-semibold py-2.5 rounded-lg text-sm transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={exportando}
            className="flex-1 bg-brand-700 hover:bg-brand-800 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60"
          >
            {exportando ? "Exportando..." : "Baixar planilha"}
          </button>
        </div>
      </form>
    </div>
  )
}
