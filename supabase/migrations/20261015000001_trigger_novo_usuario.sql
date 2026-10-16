-- O dump do schema público não traz os gatilhos das tabelas do schema auth.
-- Este cria o profile de cada usuário novo (função public.handle_new_user, do schema inicial).
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
