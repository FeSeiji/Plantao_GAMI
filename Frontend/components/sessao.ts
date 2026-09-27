const CHAVES_SESSAO = ["token", "userId", "roles", "email", "nome", "sigla"]

export function limparSessao() {
  CHAVES_SESSAO.forEach((chave) => localStorage.removeItem(chave))
}

// Disparado pela tela de perfil ao salvar, para o badge da sigla reler nome/sigla do localStorage
export const EVENTO_PERFIL_ATUALIZADO = "perfil-atualizado"
