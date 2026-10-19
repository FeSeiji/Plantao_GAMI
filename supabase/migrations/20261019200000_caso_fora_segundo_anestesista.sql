-- Caso fora com até dois anestesistas: o segundo é opcional e não pode repetir o primeiro
alter table public.casos_fora add column segundo_anestesista_id uuid references public.profiles(id);
alter table public.casos_fora add constraint casos_fora_anestesistas_diferentes check (segundo_anestesista_id <> anestesista_id);
