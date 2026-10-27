-- Financeiro do BM (Etapa 2A): o que o escritório digitava na planilha do cliente passa a ficar no sistema.
-- Quem edita é quem tem a flag app_metadata.bm_access; todos os sócios veem. Todos os meses continuam
-- editáveis. Nada aqui guarda resultado de conta: o BM é recalculado na hora a partir destes valores.

-- Valores do mês: faturamento (T2, U2 e V2 da planilha) e o valor pago por plantão de plantonista em cada
-- categoria (a despesa "Plantonistas" é plantões × valor). Valor de plantão vazio: vale o do último mês preenchido
create table public.bm_meses (
  mes date primary key, -- primeiro dia do mês
  faturamento_pmp numeric(12,2),
  recibos_gami numeric(12,2), -- recibos emitidos pelo Healthchess (GAMI com recibo)
  gami_total numeric(12,2), -- faturamento GAMI na PRO
  valor_diurno numeric(10,2),
  valor_noturno numeric(10,2),
  valor_diurno_fds numeric(10,2),
  valor_noturno_fds numeric(10,2),
  atualizado_por uuid not null references public.profiles(id),
  atualizado_em timestamptz not null default now(),
  constraint bm_meses_primeiro_dia check (extract(day from mes) = 1)
);

-- Valores de cada sócio no mês: GAMI PRO sem recibo (linha 2) e o fator de correção (linha 134)
create table public.bm_socios_mes (
  mes date not null,
  usuario_id uuid not null references public.profiles(id),
  gami_pro_sem_recibo numeric(12,2),
  fator_correcao numeric(6,4) not null default 1 check (fator_correcao > 0 and fator_correcao <= 10),
  atualizado_por uuid not null references public.profiles(id),
  atualizado_em timestamptz not null default now(),
  primary key (mes, usuario_id),
  constraint bm_socios_mes_primeiro_dia check (extract(day from mes) = 1)
);

-- Itens de despesa da PMP e da GAMI. O escritório pode incluir, renomear ou desativar itens; desativar tira
-- o item dos meses sem valor nele, mas os meses que já têm valor continuam mostrando.
-- calculo: produtividade (0,1% do faturamento, como na planilha) ou plantonistas (plantões × valor);
-- vazio = valor digitado
create table public.bm_despesa_itens (
  id uuid primary key default gen_random_uuid(),
  empresa text not null check (empresa in ('pmp', 'gami')),
  nome text not null check (length(trim(nome)) > 0),
  ordem integer not null,
  calculo text check (calculo in ('produtividade', 'plantonistas')),
  ativo boolean not null default true,
  atualizado_por uuid references public.profiles(id),
  atualizado_em timestamptz not null default now()
);

-- Valor de cada despesa no mês, com o banco e a data em que foi paga
create table public.bm_despesas (
  mes date not null,
  item_id uuid not null references public.bm_despesa_itens(id),
  banco text,
  data_pago date,
  valor numeric(12,2),
  atualizado_por uuid not null references public.profiles(id),
  atualizado_em timestamptz not null default now(),
  primary key (mes, item_id),
  constraint bm_despesas_primeiro_dia check (extract(day from mes) = 1)
);

-- Itens da planilha do cliente (BM DEZ 26.xlsx, linhas 83 a 124), na mesma ordem
insert into public.bm_despesa_itens (empresa, nome, ordem, calculo) values
  ('pmp', 'Aluguel escr.', 1, null),
  ('pmp', 'I.P.T.U.', 2, null),
  ('pmp', 'Condomínio', 3, null),
  ('pmp', 'Tel 3283-5573', 4, null),
  ('pmp', 'Tel 3284-6510', 5, null),
  ('pmp', 'Eletropaulo', 6, null),
  ('pmp', 'Net Virtua', 7, null),
  ('pmp', 'UOL', 8, null),
  ('pmp', 'Healthchess - hospedagem', 9, null),
  ('pmp', 'Healthchess - mensalidade', 10, null),
  ('pmp', 'Healthchess - NFS-e', 11, null),
  ('pmp', 'Healthchess - NFS-e', 12, null),
  ('pmp', 'Digital', 13, null),
  ('pmp', 'Caixinha do escritório', 14, null),
  ('pmp', 'Cprinter Inform. (máq. xerox)', 15, null),
  ('pmp', 'Hilton informática', 16, null),
  ('pmp', 'Motoboy', 17, null),
  ('pmp', 'Salário Gabriel', 18, null),
  ('pmp', 'Benefícios Gabriel', 19, null),
  ('pmp', 'Salário Elza', 20, null),
  ('pmp', 'Benefícios Elza', 21, null),
  ('pmp', 'Salário Queti', 22, null),
  ('pmp', 'Benefícios Queti', 23, null),
  ('pmp', 'Produtividade Gabriel', 24, 'produtividade'),
  ('pmp', 'Produtividade Elza', 25, 'produtividade'),
  ('pmp', 'IRRF funcionária', 26, null),
  ('pmp', 'IRRF funcionária - 13º', 27, null),
  ('pmp', 'FGTS', 28, null),
  ('pmp', 'Sind. Empr em Estab Saúde', 29, null),
  ('pmp', 'Contabilidade', 30, null),
  ('pmp', 'Consultax', 31, null),
  ('pmp', 'INSS pró-labore sócios', 32, null),
  ('pmp', 'INSS - Clean Office', 33, null),
  ('pmp', 'Plantonistas', 34, 'plantonistas'),
  ('pmp', 'Advogado', 35, null),
  ('pmp', 'Despesas mensal/controle com secretárias', 36, null),
  ('pmp', 'Previsão impostos (CSLL e IRPJ)', 37, null),
  ('gami', 'Produtividade Gabriel', 1, 'produtividade'),
  ('gami', 'Produtividade Elza', 2, 'produtividade'),
  ('gami', 'Sind. Empr em Estab Saúde', 3, null),
  ('gami', 'Contabilidade', 4, null),
  ('gami', 'Senacont diversos', 5, null),
  ('gami', 'INSS pró-labore sócios', 6, null),
  ('gami', 'INSS - Clean Office', 7, null),
  ('gami', 'Advogado', 8, null),
  ('gami', 'Despesas mensal/controle com secretárias', 9, null),
  ('gami', 'Previsão impostos (CSLL e IRPJ)', 10, null);

-- Histórico de tudo o que muda no financeiro: a linha antes e depois, quem mudou e quando.
-- Gravado pelo banco, na mesma transação da mudança (quem fez vem de atualizado_por, que o backend preenche)
create table public.bm_historico (
  id uuid primary key default gen_random_uuid(),
  tabela text not null,
  mes date, -- vazio nas mudanças da lista de despesas, que valem para todos os meses
  antes jsonb,
  depois jsonb not null,
  feito_por uuid references public.profiles(id),
  feito_em timestamptz not null default now()
);

create index bm_historico_mes on public.bm_historico (mes);

create or replace function public.registrar_historico_bm() returns trigger
language plpgsql as $$
begin
  insert into public.bm_historico (tabela, mes, antes, depois, feito_por)
  values (
    tg_table_name,
    (to_jsonb(new) ->> 'mes')::date,
    case when tg_op = 'UPDATE' then to_jsonb(old) end,
    to_jsonb(new),
    new.atualizado_por
  );
  return new;
end;
$$;

create trigger bm_meses_historico after insert or update on public.bm_meses
for each row execute function public.registrar_historico_bm();
create trigger bm_socios_mes_historico after insert or update on public.bm_socios_mes
for each row execute function public.registrar_historico_bm();
create trigger bm_despesas_historico after insert or update on public.bm_despesas
for each row execute function public.registrar_historico_bm();
-- A carga inicial dos itens acima não entra no histórico: o trigger da lista é criado depois dela
create trigger bm_despesa_itens_historico after insert or update on public.bm_despesa_itens
for each row execute function public.registrar_historico_bm();

-- Como as demais tabelas: só o backend (service role) acessa
alter table public.bm_meses enable row level security;
alter table public.bm_socios_mes enable row level security;
alter table public.bm_despesa_itens enable row level security;
alter table public.bm_despesas enable row level security;
alter table public.bm_historico enable row level security;
