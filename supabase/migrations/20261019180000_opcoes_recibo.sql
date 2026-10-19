-- Recibo do caso fora: só gami ("GAMI/ADDS" na tela) e sem_recibo ("Sem nota fiscal").
-- PMP e Pessoal saíram; os casos que tinham essas opções ficam sem recibo.
update public.casos_fora set recibo = null where recibo in ('pmp', 'pessoal');

alter table public.casos_fora drop constraint casos_fora_recibo_check;
alter table public.casos_fora add constraint casos_fora_recibo_check check (recibo in ('gami', 'sem_recibo'));
