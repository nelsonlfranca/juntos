-- App Juntos (finanças da família)
-- Cole tudo no Supabase > SQL Editor > New query > Run.
-- Cria só tabelas com prefixo fin_ e o bucket fin-notas. Não altera nada que já existe no projeto.

create table if not exists public.fin_espacos (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(nome) between 1 and 80),
  renda numeric not null default 0,
  criado_por uuid not null default auth.uid() references auth.users(id) on delete cascade,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create table if not exists public.fin_membros (
  espaco_id uuid not null references public.fin_espacos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  papel text not null default 'membro' check (papel in ('admin','membro')),
  nome text,
  created_at timestamptz not null default now(),
  primary key (espaco_id, user_id)
);
create table if not exists public.fin_convites (
  codigo text primary key,
  espaco_id uuid not null references public.fin_espacos(id) on delete cascade,
  criado_por uuid not null default auth.uid(),
  expira_em timestamptz not null default now() + interval '7 days'
);
create table if not exists public.fin_lancamentos (
  id uuid primary key,
  espaco_id uuid not null references public.fin_espacos(id) on delete cascade,
  data date not null,
  descricao text check (char_length(descricao) <= 80),
  valor numeric not null,
  tipo text not null default 's' check (tipo in ('s','e')),
  categoria text,
  quem text,
  conta text,
  nota_path text,
  nfce_url text,
  criado_por uuid default auth.uid(),
  deleted boolean not null default false,
  updated_at timestamptz not null default now()
);
create index if not exists fin_lanc_espaco_upd on public.fin_lancamentos (espaco_id, updated_at);
create table if not exists public.fin_contas (
  id uuid primary key,
  espaco_id uuid not null references public.fin_espacos(id) on delete cascade,
  nome text not null check (char_length(nome) <= 80),
  valor numeric,
  grupo text default 'Outras',
  ordem int default 50,
  desde text,
  ate text,
  valores jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default now()
);
create index if not exists fin_contas_espaco_upd on public.fin_contas (espaco_id, updated_at);
create table if not exists public.fin_pagamentos (
  espaco_id uuid not null references public.fin_espacos(id) on delete cascade,
  conta_id uuid not null,
  mes text not null,
  pago boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (conta_id, mes)
);
create table if not exists public.fin_metas (
  espaco_id uuid not null references public.fin_espacos(id) on delete cascade,
  categoria text not null,
  valor numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (espaco_id, categoria)
);

create or replace function public.fin_eh_membro(e uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.fin_membros m where m.espaco_id = e and m.user_id = auth.uid());
$$;
create or replace function public.fin_eh_admin(e uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.fin_membros m where m.espaco_id = e and m.user_id = auth.uid() and m.papel = 'admin');
$$;

create or replace function public.fin_touch() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
do $$ declare t text; begin
  foreach t in array array['fin_espacos','fin_lancamentos','fin_contas','fin_pagamentos','fin_metas'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.fin_touch()', t || '_touch', t);
  end loop;
end $$;

alter table public.fin_espacos enable row level security;
alter table public.fin_membros enable row level security;
alter table public.fin_convites enable row level security;
alter table public.fin_lancamentos enable row level security;
alter table public.fin_contas enable row level security;
alter table public.fin_pagamentos enable row level security;
alter table public.fin_metas enable row level security;

drop policy if exists fin_espacos_ler on public.fin_espacos;
drop policy if exists fin_espacos_editar on public.fin_espacos;
drop policy if exists fin_membros_ler on public.fin_membros;
drop policy if exists fin_membros_sair on public.fin_membros;
drop policy if exists fin_membros_nome on public.fin_membros;
drop policy if exists fin_convites_ler on public.fin_convites;
create policy fin_espacos_ler on public.fin_espacos for select to authenticated using (public.fin_eh_membro(id));
create policy fin_espacos_editar on public.fin_espacos for update to authenticated using (public.fin_eh_membro(id)) with check (public.fin_eh_membro(id));
create policy fin_membros_ler on public.fin_membros for select to authenticated using (public.fin_eh_membro(espaco_id));
create policy fin_membros_sair on public.fin_membros for delete to authenticated using (user_id = auth.uid() or public.fin_eh_admin(espaco_id));
create policy fin_membros_nome on public.fin_membros for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy fin_convites_ler on public.fin_convites for select to authenticated using (public.fin_eh_membro(espaco_id));

do $$ declare t text; begin
  foreach t in array array['fin_lancamentos','fin_contas','fin_pagamentos','fin_metas'] loop
    execute format('drop policy if exists %I on public.%I', t || '_ler', t);
    execute format('drop policy if exists %I on public.%I', t || '_inserir', t);
    execute format('drop policy if exists %I on public.%I', t || '_editar', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.fin_eh_membro(espaco_id))', t || '_ler', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.fin_eh_membro(espaco_id))', t || '_inserir', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.fin_eh_membro(espaco_id)) with check (public.fin_eh_membro(espaco_id))', t || '_editar', t);
  end loop;
end $$;

create or replace function public.fin_criar_espaco(p_nome text, p_meu_nome text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare novo uuid;
begin
  if auth.uid() is null then raise exception 'login necessário'; end if;
  insert into public.fin_espacos (nome, criado_por) values (p_nome, auth.uid()) returning id into novo;
  insert into public.fin_membros (espaco_id, user_id, papel, nome) values (novo, auth.uid(), 'admin', p_meu_nome);
  return novo;
end $$;

create or replace function public.fin_criar_convite(p_espaco uuid) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare c text;
begin
  if not public.fin_eh_membro(p_espaco) then raise exception 'sem acesso'; end if;
  c := upper(substr(translate(encode(extensions.gen_random_bytes(9), 'base64'), '+/=OIl01', ''), 1, 6));
  insert into public.fin_convites (codigo, espaco_id) values (c, p_espaco);
  return c;
end $$;

create or replace function public.fin_entrar(p_codigo text, p_meu_nome text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare e uuid;
begin
  if auth.uid() is null then raise exception 'login necessário'; end if;
  select espaco_id into e from public.fin_convites where codigo = upper(trim(p_codigo)) and expira_em > now();
  if e is null then raise exception 'convite inválido ou vencido'; end if;
  insert into public.fin_membros (espaco_id, user_id, papel, nome) values (e, auth.uid(), 'membro', p_meu_nome)
    on conflict (espaco_id, user_id) do nothing;
  return e;
end $$;

revoke execute on function public.fin_criar_espaco(text, text) from anon, public;
revoke execute on function public.fin_criar_convite(uuid) from anon, public;
revoke execute on function public.fin_entrar(text, text) from anon, public;
grant execute on function public.fin_criar_espaco(text, text) to authenticated;
grant execute on function public.fin_criar_convite(uuid) to authenticated;
grant execute on function public.fin_entrar(text, text) to authenticated;

insert into storage.buckets (id, name, public) values ('fin-notas', 'fin-notas', false) on conflict (id) do nothing;
drop policy if exists fin_notas_ler on storage.objects;
drop policy if exists fin_notas_enviar on storage.objects;
create policy fin_notas_ler on storage.objects for select to authenticated
  using (bucket_id = 'fin-notas' and public.fin_eh_membro(((storage.foldername(name))[1])::uuid));
create policy fin_notas_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'fin-notas' and public.fin_eh_membro(((storage.foldername(name))[1])::uuid));
