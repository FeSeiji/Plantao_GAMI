const CHAVES_SESSAO = ["token", "userId", "roles", "email", "nome", "sigla"]

export function limparSessao() {
  CHAVES_SESSAO.forEach((chave) => localStorage.removeItem(chave))
}
