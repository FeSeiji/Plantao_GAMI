// Caso fora — mesmas regras de Backend/src/controllers/casosFora.js
import { Pessoa } from "./fichas"

export type Recibo = "gami" | "pmp" | "sem_recibo" | "pessoal"

export const RECIBOS: { valor: Recibo; rotulo: string }[] = [
  { valor: "gami", rotulo: "GAMI" },
  { valor: "pmp", rotulo: "PMP" },
  { valor: "sem_recibo", rotulo: "Sem recibo" },
  { valor: "pessoal", rotulo: "Pessoal" },
]

export const MAX_TEXTO = 200
export const MAX_COMENTARIOS = 2000

// Item das listas cadastradas pela gestão (hospitais) e pelo escritório (cirurgiões)
export type ItemCadastro = { id: string; nome: string | null; ativo: boolean }
export type Hospital = ItemCadastro
export type Cirurgiao = ItemCadastro

export type CasoFora = {
  id: string
  data: string
  escalado: boolean
  cirurgiao: string
  paciente_nome: string
  paciente_cpf: string
  cirurgia: string
  hospital: Hospital | null
  recibo: Recibo | null
  valor: number | null
  comentarios: string | null
  anestesista: Pessoa
  criadoPor: Pessoa
  criadoEm: string
  atualizadoPor: Pessoa | null
  atualizadoEm: string | null
  podeEditar?: boolean
}

export const rotuloRecibo = (recibo: Recibo | null) => RECIBOS.find((r) => r.valor === recibo)?.rotulo ?? ""

// "52998224725" ou parte dele -> "529.982.247-25"
export function formatarCpf(cpf: string) {
  const d = cpf.replace(/\D/g, "").slice(0, 11)
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2")
}

// 11 dígitos, não todos iguais, e os dois dígitos verificadores batendo
export function cpfValido(cpf: string) {
  const d = cpf.replace(/\D/g, "")
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false
  const digito = (tamanho: number) => {
    let soma = 0
    for (let i = 0; i < tamanho; i++) soma += Number(d[i]) * (tamanho + 1 - i)
    const resto = (soma * 10) % 11
    return resto === 10 ? 0 : resto
  }
  return digito(9) === Number(d[9]) && digito(10) === Number(d[10])
}

export function formatarValor(valor: number | null) {
  if (valor == null) return "—"
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}
