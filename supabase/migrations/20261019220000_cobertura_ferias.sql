-- Cobertura de férias: o médico de férias continua na vaga (e com os pontos) e outro médico cobre o turno inteiro,
-- recebendo os mesmos pontos. Fica em plantao_trocas como uma troca por horas do turno todo, marcada aqui.
alter table public.plantao_trocas add column cobertura_ferias boolean not null default false;
