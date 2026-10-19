-- Cirurgiões dos casos fora: as sugestões do campo Cirurgião, cadastradas só pelo escritório.
-- O médico pode digitar um nome fora da lista: o caso guarda o nome em casos_fora.cirurgiao e fica sem cirurgiao_id.
create table public.cirurgioes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- Nome único sem diferenciar maiúsculas, como em hospitais
create unique index cirurgioes_nome_unico on public.cirurgioes (lower(nome));

alter table public.casos_fora add column cirurgiao_id uuid references public.cirurgioes(id);

-- Como as demais tabelas: só o backend (service role) acessa
alter table public.cirurgioes enable row level security;
