-- Ajustes manuais de pontos do BM (ex.: +10 de administrativo, +5 por uma reunião), lançados por quem tem a
-- flag admin para qualquer sócio, em qualquer mês. Somam aos pontos dos plantões no BM Financeiro.
-- Excluir não apaga a linha: marca excluido_em, para o histórico continuar mostrando o que existiu.
create table public.ajustes_pontos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.profiles(id),
  mes date not null, -- primeiro dia do mês do BM
  pontos numeric(6,2) not null,
  motivo text not null,
  criado_por uuid not null references public.profiles(id),
  criado_em timestamptz not null default now(),
  atualizado_por uuid references public.profiles(id),
  atualizado_em timestamptz,
  excluido_por uuid references public.profiles(id),
  excluido_em timestamptz,
  constraint ajustes_pontos_mes_primeiro_dia check (extract(day from mes) = 1),
  constraint ajustes_pontos_diferente_de_zero check (pontos <> 0),
  constraint ajustes_pontos_motivo_preenchido check (length(trim(motivo)) > 0)
);

create index ajustes_pontos_mes on public.ajustes_pontos (mes);

-- Histórico: uma linha por criação, edição ou exclusão, com o ajuste como ficou depois da ação
-- (na exclusão, como estava). Comparar com a linha anterior do mesmo ajuste mostra o que mudou.
create table public.ajustes_pontos_historico (
  id uuid primary key default gen_random_uuid(),
  ajuste_id uuid not null references public.ajustes_pontos(id),
  acao text not null check (acao in ('criado', 'editado', 'excluido')),
  usuario_id uuid not null,
  mes date not null,
  pontos numeric(6,2) not null,
  motivo text not null,
  feito_por uuid not null references public.profiles(id),
  feito_em timestamptz not null default now()
);

create index ajustes_pontos_historico_ajuste on public.ajustes_pontos_historico (ajuste_id);

-- O histórico é gravado pelo banco, na mesma transação da mudança: não tem como o ajuste mudar sem deixar rastro.
-- Quem fez vem das colunas criado_por, atualizado_por e excluido_por, que o backend preenche.
create or replace function public.registrar_historico_ajuste_pontos() returns trigger
language plpgsql as $$
declare
  v_acao text;
  v_feito_por uuid;
begin
  if tg_op = 'INSERT' then
    v_acao := 'criado';
    v_feito_por := new.criado_por;
  elsif new.excluido_em is not null and old.excluido_em is null then
    v_acao := 'excluido';
    v_feito_por := new.excluido_por;
  else
    v_acao := 'editado';
    v_feito_por := new.atualizado_por;
  end if;

  insert into public.ajustes_pontos_historico (ajuste_id, acao, usuario_id, mes, pontos, motivo, feito_por)
  values (new.id, v_acao, new.usuario_id, new.mes, new.pontos, new.motivo, v_feito_por);

  return new;
end;
$$;

create trigger ajustes_pontos_historico
after insert or update on public.ajustes_pontos
for each row execute function public.registrar_historico_ajuste_pontos();

-- Como as demais tabelas: só o backend (service role) acessa
alter table public.ajustes_pontos enable row level security;
alter table public.ajustes_pontos_historico enable row level security;
