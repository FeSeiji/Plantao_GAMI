-- Pedido de um médico para entrar numa vaga livre do plantão. A gestão aprova (o médico entra na vaga) ou recusa.
-- Cancelado: o próprio médico desistiu, a gestão preencheu a vaga antes ou ele entrou em outra vaga do mesmo turno.
create table public.plantao_pedidos_vaga (
  id uuid primary key default gen_random_uuid(),
  plantao_id uuid not null references public.plantoes(id) on delete cascade,
  posicao smallint not null check (posicao between 1 and 13),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pendente' check (status in ('pendente', 'aprovado', 'recusado', 'cancelado')),
  solicitado_em timestamptz not null default now(),
  respondido_por uuid references auth.users(id) on delete set null,
  respondido_em timestamptz
);

-- Um pedido pendente por médico e vaga (vários médicos podem pedir a mesma vaga)
create unique index plantao_pedidos_vaga_pendente_key
  on public.plantao_pedidos_vaga (plantao_id, posicao, usuario_id)
  where status = 'pendente';

create index plantao_pedidos_vaga_plantao_idx on public.plantao_pedidos_vaga (plantao_id);
create index plantao_pedidos_vaga_status_idx on public.plantao_pedidos_vaga (status, solicitado_em);

-- Como as demais tabelas: só o backend (service role) acessa
alter table public.plantao_pedidos_vaga enable row level security;
