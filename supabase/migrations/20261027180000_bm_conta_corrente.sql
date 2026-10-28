-- Financeiro do BM (Etapa 2B): a conta corrente de cada sócio (linhas 175 a 197 da planilha do cliente) e a
-- previsão de impostos calculada. A conta corrente começa em novembro de 2026 (services/calculoBm.js): nesse mês a
-- diferença do mês anterior é o saldo_inicial digitado; nos seguintes, a diferença final do mês anterior, refeita
-- na hora em cascata. Como no resto do financeiro, nada aqui guarda resultado de conta.
alter table public.bm_socios_mes
  add column saldo_inicial numeric(12,2), -- só no primeiro mês da conta corrente
  add column darf numeric(12,2),
  add column pro_labore numeric(12,2),
  add column distr_dia_05 numeric(12,2),
  add column distr_dia_10 numeric(12,2),
  -- Em que banco saiu a distribuição dos dias 05 e 10 (o balanço confere que bate com o total)
  add column bradesco_dia_05 numeric(12,2),
  add column itau_dia_05 numeric(12,2),
  add column bradesco_dia_10 numeric(12,2),
  add column itau_dia_10 numeric(12,2),
  add column cef numeric(12,2);

-- "Previsão impostos (CSLL e IRPJ)" passa a ser calculada pelo faturamento, como no quadro de impostos
-- trimestrais da planilha. A mudança da lista não entra no histórico do BM: é do sistema, não de uma pessoa
alter table public.bm_despesa_itens drop constraint bm_despesa_itens_calculo_check;
alter table public.bm_despesa_itens add constraint bm_despesa_itens_calculo_check
  check (calculo in ('produtividade', 'plantonistas', 'impostos'));

alter table public.bm_despesa_itens disable trigger bm_despesa_itens_historico;
update public.bm_despesa_itens set calculo = 'impostos'
  where calculo is null and ((empresa = 'pmp' and ordem = 37) or (empresa = 'gami' and ordem = 10));
alter table public.bm_despesa_itens enable trigger bm_despesa_itens_historico;
