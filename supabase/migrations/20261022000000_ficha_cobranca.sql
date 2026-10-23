-- Cobrança da ficha: convênio ou particular. Opcional; as fichas registradas antes ficam sem.
alter table public.fichas_anestesicas add column cobranca text check (cobranca in ('convenio', 'particular'));
