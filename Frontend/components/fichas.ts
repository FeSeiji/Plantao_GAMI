// Ficha anestésica — mesmas regras de Backend/src/controllers/fichas.js

export type Pessoa = { id: string; nome?: string | null; email?: string | null; sigla?: string | null; crm?: string | null }

export type TipoAnestesia = "raquianestesia" | "duplo_bloqueio" | "geral" | "peridural" | "outros"

export const TIPOS_ANESTESIA: { valor: TipoAnestesia; rotulo: string }[] = [
  { valor: "raquianestesia", rotulo: "Raquianestesia" },
  { valor: "duplo_bloqueio", rotulo: "Duplo bloqueio" },
  { valor: "geral", rotulo: "A. geral" },
  { valor: "peridural", rotulo: "Peridural" },
  { valor: "outros", rotulo: "Outros" },
]

export const MAX_FOTOS = 1
export const MAX_OBSERVACOES = 2000
export const MAX_ANESTESISTAS = 10

// Hospital ou convênio da ficha (cadastrados pela gestão)
export type Referencia = { id: string; nome: string | null; cnpj: string | null }

export type SexoPaciente = "M" | "F"

export type FichaResumo = {
  id: string
  data: string
  data_fim: string
  hora_inicio: string
  hora_fim: string
  tipo_anestesia: TipoAnestesia
  tipo_outro: string | null
  observacoes: string | null
  valor: number | null
  // Modelo do faturamento (as fichas antigas não têm esses dados)
  numero_atendimento: string | null
  autorizacao: string | null
  paciente_nome: string | null
  paciente_cpf: string | null
  paciente_sexo: SexoPaciente | null
  paciente_nascimento: string | null
  cirurgiao_nome: string | null
  cirurgiao_crm: string | null
  procedimento_codigo: string | null
  procedimento_nome: string | null
  hospital: Referencia | null
  convenio: Referencia | null
  anestesistas: Pessoa[]
  qtdFotos: number
  criadoPor: Pessoa
  criadoEm: string
  atualizadoPor: Pessoa | null
  atualizadoEm: string | null
  podeEditar: boolean
}

// O detalhe traz os links temporários das fotos (o armazenamento é privado)
export type FichaDetalhe = Omit<FichaResumo, "qtdFotos"> & { fotos: { caminho: string; url: string }[] }

// Uma linha da planilha de exportação: uma por anestesista da ficha, na ordem das colunas
export type LinhaExportacao = {
  data: string
  hora: string
  numero_atendimento: string | null
  autorizacao: string | null
  paciente: string | null
  paciente_cpf: string | null
  paciente_sexo: SexoPaciente | null
  paciente_nascimento: string | null
  anestesista_crm: string | null
  anestesista: string | null
  cirurgiao_crm: string | null
  cirurgiao: string | null
  convenio_cnpj: string | null
  convenio: string | null
  hospital_cnpj: string | null
  hospital: string | null
  procedimento_codigo: string | null
  procedimento_nome: string | null
}

export const ROTULO_SEXO: Record<SexoPaciente, string> = { M: "Masculino", F: "Feminino" }

export function rotuloTipo(f: { tipo_anestesia: TipoAnestesia; tipo_outro: string | null }) {
  if (f.tipo_anestesia === "outros") return f.tipo_outro || "Outros"
  return TIPOS_ANESTESIA.find((t) => t.valor === f.tipo_anestesia)?.rotulo ?? f.tipo_anestesia
}

// Foto do celular reduzida antes do envio: no máximo 1600px no lado maior, JPEG ~70%
// (umas centenas de KB em vez de vários MB). Retorna um data URL.
export async function comprimirImagem(arquivo: File, ladoMaximo = 1600, qualidade = 0.7): Promise<string> {
  const url = URL.createObjectURL(arquivo)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error("Não foi possível ler a imagem."))
      el.src = url
    })
    const escala = Math.min(1, ladoMaximo / Math.max(img.width, img.height))
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(img.width * escala)
    canvas.height = Math.round(img.height * escala)
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Não foi possível processar a imagem.")
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL("image/jpeg", qualidade)
  } finally {
    URL.revokeObjectURL(url)
  }
}
