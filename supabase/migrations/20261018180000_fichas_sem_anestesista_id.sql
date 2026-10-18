-- Limpeza das fichas anestésicas depois dos vários anestesistas e da data final:
-- a coluna antiga de um anestesista só deixa de existir (o backend usa anestesista_ids).
-- Os updates cobrem fichas que ainda estivessem só no formato antigo.
update public.fichas_anestesicas
  set anestesista_ids = array[anestesista_id]
  where cardinality(anestesista_ids) = 0 and anestesista_id is not null;

update public.fichas_anestesicas
  set data_fim = case when hora_fim <= hora_inicio then data + 1 else data end
  where data_fim is null;

alter table public.fichas_anestesicas drop column anestesista_id;
