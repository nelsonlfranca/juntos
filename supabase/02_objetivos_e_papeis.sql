-- Juntos: objetivos de economia e troca de papel no espaço (já aplicado no projeto)
create table if not exists public.fin_objetivos (
  id uuid primary key,
  espaco_id uuid not null references public.fin_espacos(id) on delete cascade,
  nome text not null check (char_length(nome) between 1 and 60),
  alvo numeric not null check (alvo > 0),
  guardado numeric not null default 0,
  prazo text,
  ordem int default 50,
  deleted boolean not null default false,
  updated_at timestamptz not null default now()
);
create index if not exists fin_obj_espaco_upd on public.fin_objetivos (espaco_id, updated_at);
drop trigger if exists fin_objetivos_touch on public.fin_objetivos;
create trigger fin_objetivos_touch before insert or update on public.fin_objetivos for each row execute function public.fin_touch();
alter table public.fin_objetivos enable row level security;
drop policy if exists fin_objetivos_ler on public.fin_objetivos;
drop policy if exists fin_objetivos_inserir on public.fin_objetivos;
drop policy if exists fin_objetivos_editar on public.fin_objetivos;
create policy fin_objetivos_ler on public.fin_objetivos for select to authenticated using (public.fin_eh_membro(espaco_id));
create policy fin_objetivos_inserir on public.fin_objetivos for insert to authenticated with check (public.fin_eh_membro(espaco_id));
create policy fin_objetivos_editar on public.fin_objetivos for update to authenticated using (public.fin_eh_membro(espaco_id)) with check (public.fin_eh_membro(espaco_id));

create or replace function public.fin_mudar_papel(p_espaco uuid, p_user uuid, p_papel text) returns void
language plpgsql security definer set search_path = public as $$
declare admins int;
begin
  if not public.fin_eh_admin(p_espaco) then raise exception 'só administradores podem mudar papéis'; end if;
  if p_papel not in ('admin','membro') then raise exception 'papel inválido'; end if;
  if p_papel = 'membro' then
    select count(*) into admins from public.fin_membros where espaco_id = p_espaco and papel = 'admin' and user_id <> p_user;
    if admins = 0 then raise exception 'o espaço precisa de pelo menos um administrador'; end if;
  end if;
  update public.fin_membros set papel = p_papel where espaco_id = p_espaco and user_id = p_user;
  if not found then raise exception 'pessoa não encontrada neste espaço'; end if;
end $$;
revoke execute on function public.fin_mudar_papel(uuid, uuid, text) from anon, public;
grant execute on function public.fin_mudar_papel(uuid, uuid, text) to authenticated;

-- Meta da projeção (já aplicado)
alter table public.fin_espacos add column if not exists proj_alvo numeric check (proj_alvo is null or proj_alvo > 0);
alter table public.fin_espacos add column if not exists proj_prazo text check (proj_prazo is null or proj_prazo ~ '^\d{4}-\d{2}$');
alter table public.fin_espacos add column if not exists proj_inicial numeric not null default 0;

-- Itens da nota fiscal (já aplicado)
alter table public.fin_lancamentos add column if not exists itens jsonb;
