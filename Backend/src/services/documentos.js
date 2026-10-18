// CPF e CNPJ: guardados só com os dígitos (a formatação fica para a tela e a planilha)

// 11 dígitos, não todos iguais, e os dois dígitos verificadores batendo
function cpfValido(cpf) {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false
  const digito = tamanho => {
    let soma = 0
    for (let i = 0; i < tamanho; i++) soma += Number(cpf[i]) * (tamanho + 1 - i)
    const resto = (soma * 10) % 11
    return resto === 10 ? 0 : resto
  }
  return digito(9) === Number(cpf[9]) && digito(10) === Number(cpf[10])
}

// CNPJ opcional: vazio vira null; preenchido precisa ter 14 dígitos
function cnpjNormalizado(valor) {
  if (valor == null || valor === '') return null
  const digitos = String(valor).replace(/\D/g, '')
  if (!/^\d{14}$/.test(digitos)) throw new Error('CNPJ deve ter 14 dígitos')
  return digitos
}

module.exports = { cpfValido, cnpjNormalizado }
