-- A subida de escala passou a ser automática (29/10/2026): quando o turno começa com o titular de férias aprovadas
-- e sem cobertura, a escala sobe sozinha. É calculada a cada leitura (services/subidas.js), sem registro no banco.
-- Em produção, rodar DEPOIS do deploy do backend que não usa mais a tabela.
drop trigger plantao_usuarios_desfaz_subida_update on public.plantao_usuarios;
drop trigger plantao_usuarios_desfaz_subida_delete on public.plantao_usuarios;
drop function public.desfazer_subida_da_vaga();
drop table public.plantao_subidas;
