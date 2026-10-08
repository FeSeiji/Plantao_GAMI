const CHAVES_SESSAO = ["token", "refreshToken", "userId", "roles", "email", "nome", "sigla"]

export function limparSessao() {
  CHAVES_SESSAO.forEach((chave) => localStorage.removeItem(chave))
}

export function salvarTokens(dados: { token: string; refresh_token?: string }) {
  localStorage.setItem("token", dados.token)
  if (dados.refresh_token) localStorage.setItem("refreshToken", dados.refresh_token)
}

// Disparado pela tela de perfil ao salvar, para o badge da sigla reler nome/sigla do localStorage
export const EVENTO_PERFIL_ATUALIZADO = "perfil-atualizado"

// Várias chamadas podem dar 401 ao mesmo tempo quando o token vence: todas esperam a mesma
// renovação, porque o refresh_token só pode ser usado uma vez
let renovacaoEmAndamento: Promise<string | null> | null = null

function renovarToken(): Promise<string | null> {
  if (!renovacaoEmAndamento) {
    renovacaoEmAndamento = (async () => {
      const refreshToken = localStorage.getItem("refreshToken")
      if (!refreshToken) return null
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        })
        if (!res.ok) return null
        const dados = await res.json()
        salvarTokens(dados)
        return dados.token as string
      } catch {
        return null
      }
    })().finally(() => {
      renovacaoEmAndamento = null
    })
  }
  return renovacaoEmAndamento
}

// fetch para a API: se o token venceu (401), renova com o refresh_token e repete a chamada uma vez.
// Se não der para renovar, devolve o 401 original e a tela mostra a mensagem de sessão expirada.
export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, init)
  if (res.status !== 401) return res

  const novoToken = await renovarToken()
  if (!novoToken) return res

  const headers = new Headers(init.headers)
  headers.set("Authorization", `Bearer ${novoToken}`)
  return fetch(url, { ...init, headers })
}
