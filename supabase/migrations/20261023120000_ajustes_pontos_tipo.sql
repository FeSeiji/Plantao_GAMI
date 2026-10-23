-- Tipo do ajuste de pontos: define em que linha do BM ele cai, como na planilha do cliente
-- (Administrativo e Reunião têm linha própria; Outro entra numa linha com o motivo). Os já lançados viram Outro.
alter table public.ajustes_pontos
  add column tipo text not null default 'outro'
  check (tipo in ('administrativo', 'reuniao', 'outro'));

alter table public.ajustes_pontos_historico add column tipo text not null default 'outro';

-- O histórico passa a guardar o tipo também
create or replace function public.registrar_historico_ajuste_pontos() returns trigger
language plpgsql as $$
declare
  v_acao text;
  v_feito_por uuid;
begin
  if tg_op = 'INSERT' then
    v_acao := 'criado';
    v_feito_por := new.criado_por;
  elsif new.excluido_em is not null and old.excluido_em is null then
    v_acao := 'excluido';
    v_feito_por := new.excluido_por;
  else
    v_acao := 'editado';
    v_feito_por := new.atualizado_por;
  end if;

  insert into public.ajustes_pontos_historico (ajuste_id, acao, usuario_id, mes, pontos, motivo, tipo, feito_por)
  values (new.id, v_acao, new.usuario_id, new.mes, new.pontos, new.motivo, new.tipo, v_feito_por);

  return new;
end;
$$;
