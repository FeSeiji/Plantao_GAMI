-- Congresso tem dois tipos: palestrante (recebe 80% da vaga) e congressista (60%). O médico continua na escala.
-- Os congressos cadastrados antes ficam sem tipo (não descontam) até alguém definir.
alter table public.afastamentos add column congresso_tipo text check (congresso_tipo in ('palestrante', 'congressista'));
alter table public.afastamentos add constraint afastamentos_congresso_tipo_so_congresso check (congresso_tipo is null or tipo = 'congresso');
