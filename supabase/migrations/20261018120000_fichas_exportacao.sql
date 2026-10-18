-- Campos da ficha anestésica para a exportação no modelo do faturamento.
-- Convênio é cadastrado pela gestão (como os hospitais dos casos fora), com o CNPJ.
create table public.convenios (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cnpj text check (cnpj ~ '^[0-9]{14}$'),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create unique index convenios_nome_unico on public.convenios (lower(nome));

alter table public.convenios enable row level security;

alter table public.hospitais
  add column cnpj text check (cnpj ~ '^[0-9]{14}$');

-- Tudo opcional no banco porque as fichas antigas não têm esses dados;
-- paciente, nascimento e procedimento são exigidos pelo backend nas fichas novas e editadas
alter table public.fichas_anestesicas
  add column numero_atendimento text,
  add column autorizacao text,
  add column paciente_nome text,
  add column paciente_cpf text check (paciente_cpf ~ '^[0-9]{11}$'),
  add column paciente_sexo char(1) check (paciente_sexo in('M', 'F')),
  add column paciente_nascimento date,
  add column cirurgiao_nome text,
  add column cirurgiao_crm text,
  add column convenio_id uuid references public.convenios(id),
  add column hospital_id uuid references public.hospitais(id),
  add column procedimento_codigo text,
  add column procedimento_nome text;