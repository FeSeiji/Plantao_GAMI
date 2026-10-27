-- Aviso no sino quando a gestão registra uma troca (ela já vale, sem aceite): um por médico envolvido (quem entra e
-- quem sai), menos quem registrou. Some do sino quando o médico marca "ciente".
create table public.avisos_troca (
  id uuid primary key default gen_random_uuid(),
  troca_id uuid not null references public.plantao_trocas(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  criado_em timestamptz not null default now(),
  ciente_em timestamptz,
  unique (troca_id, usuario_id)
);

create index avisos_troca_nao_lidos_idx on public.avisos_troca (usuario_id) where ciente_em is null;

-- Como as demais tabelas: só o backend (service role) acessa
alter table public.avisos_troca enable row level security;
