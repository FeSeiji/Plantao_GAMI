-- Plantão extra (2026-10-28): um médico num horário livre de um dia, em paralelo ao plantão do dia e sem ligação
-- com as vagas dele. Só a gestão cria, edita e exclui; não tem troca nem pedido de vaga. Bloqueia o horário do
-- médico como uma vaga (services/conflitos.js).
-- posicao: só do sócio — a vaga cuja pontuação ele recebe, proporcional às horas do extra (services/bm.js).
-- Plantonista e sócio Jr contam as horas; no BM, o plantonista recebe horas × valor_hora_extra do mês.
create table public.plantoes_extras (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  hora_inicio time not null,
  hora_fim time not null, -- antes do início: termina no dia seguinte
  usuario_id uuid not null references public.profiles(id),
  posicao smallint check (posicao between 1 and 13),
  observacao text check (length(observacao) <= 200),
  criado_por uuid not null references public.profiles(id),
  criado_em timestamptz not null default now(),
  atualizado_por uuid references public.profiles(id),
  atualizado_em timestamptz,
  constraint plantoes_extras_duracao check (hora_fim <> hora_inicio)
);

create index plantoes_extras_data_idx on public.plantoes_extras (data);
create index plantoes_extras_usuario_idx on public.plantoes_extras (usuario_id, data);

-- Como as demais tabelas: só o backend (service role) acessa
alter table public.plantoes_extras enable row level security;

-- Valor da hora do plantão extra do plantonista, no BM do mês (vazio: vale o do último mês preenchido)
alter table public.bm_meses add column valor_hora_extra numeric(10,2);
