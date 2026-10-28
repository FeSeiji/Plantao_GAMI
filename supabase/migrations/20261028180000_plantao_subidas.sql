-- Subida de escala (Dra. Aline, 28/10/2026): a vaga de quem está de férias ficou sem cobertura e a gestão "sobe a
-- escala". Ninguém muda de vaga no banco: quem está abaixo dela no mesmo turno passa a valer uma posição acima
-- (o 4º recebe como 3º, o 5º como 4º...) e quem está de férias continua na vaga, recebendo os pontos dela.
-- Só sobem as posições numeradas (services/posicoes.js, vagasQueSobem): ninguém vira coordenador por subida.
-- usuario_id: o titular de férias; a subida só vale enquanto ele estiver na vaga.
create table public.plantao_subidas (
  id uuid primary key default gen_random_uuid(),
  plantao_id uuid not null references public.plantoes(id) on delete cascade,
  posicao smallint not null check (posicao between 1 and 13),
  usuario_id uuid not null references public.profiles(id),
  criado_por uuid not null references public.profiles(id),
  criado_em timestamptz not null default now(),
  unique (plantao_id, posicao)
);

-- Como as demais tabelas: só o backend (service role) acessa
alter table public.plantao_subidas enable row level security;

-- A vaga mudou de mãos (troca, remoção, mudança de vaga): a subida dela deixa de valer
create function public.desfazer_subida_da_vaga() returns trigger
language plpgsql as $$
begin
  delete from public.plantao_subidas where plantao_id = old.plantao_id and posicao = old.posicao;
  return null;
end;
$$;

create trigger plantao_usuarios_desfaz_subida_update after update on public.plantao_usuarios
for each row when (old.usuario_id is distinct from new.usuario_id or old.posicao is distinct from new.posicao)
execute function public.desfazer_subida_da_vaga();

create trigger plantao_usuarios_desfaz_subida_delete after delete on public.plantao_usuarios
for each row execute function public.desfazer_subida_da_vaga();
