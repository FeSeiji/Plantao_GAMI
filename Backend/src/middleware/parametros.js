// Formatos dos parâmetros. Um id ou uma data fora do formato chegavam ao Supabase, que responde com um erro de
// sintaxe do Postgres, e a rota devolvia 500 com essa mensagem técnica
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const ehUuid = valor => UUID_REGEX.test(valor ?? '')

// 'AAAA-MM-DD' de um dia que existe
function ehData(valor) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor ?? '')) return false
  const d = new Date(`${valor}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valor
}

// Os ids de rota (:id, :trocaId...) são uuid: fora do formato, o registro não existe
function exigirUuid(router, ...nomes) {
  for (const nome of nomes) {
    router.param(nome, (req, res, next, valor) =>
      ehUuid(valor) ? next() : res.status(404).json({ error: 'Registro não encontrado' })
    )
  }
}

// Erro 400 se inicio ou fim da query não forem datas; null se estiverem certas (ou ausentes)
function erroDoPeriodo({ inicio, fim }) {
  if ((inicio && !ehData(inicio)) || (fim && !ehData(fim))) return 'inicio e fim devem estar no formato AAAA-MM-DD'
  return null
}

module.exports = { ehUuid, ehData, exigirUuid, erroDoPeriodo }
