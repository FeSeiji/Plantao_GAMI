// O Supabase devolve no máximo max_rows linhas por consulta (1000 por padrão). Para ler um período longo sem
// cortar o resultado, busca em páginas até vir uma vazia, avançando pelo que de fato veio (assim não depende do
// valor configurado). montarConsulta: () => uma consulta nova, com uma ordem estável (o id desempata)
const PAGINA = 1000

async function buscarEmPaginas(montarConsulta) {
  const linhas = []
  for (;;) {
    const { data, error } = await montarConsulta().range(linhas.length, linhas.length + PAGINA - 1)
    if (error) throw error
    if (data.length === 0) return linhas
    linhas.push(...data)
  }
}

module.exports = { buscarEmPaginas }
