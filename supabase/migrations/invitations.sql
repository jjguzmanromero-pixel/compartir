-- ============================================================
-- Ejecutar este SQL DESPUÉS del setup.sql inicial
-- Supabase → SQL Editor → New query
-- ============================================================

-- Tabla de invitaciones
create table public.invitations (
  id uuid default gen_random_uuid() primary key,
  email text not null,
  role text default 'user' check (role in ('user', 'admin')),
  invited_by uuid references auth.users on delete set null,
  accepted boolean default false,
  created_at timestamp with time zone default now()
);

-- Índice para búsqueda por email
create unique index invitations_email_idx on public.invitations(email);

-- RLS en invitations
alter table public.invitations enable row level security;

-- Solo admin puede ver y crear invitaciones
create policy "Admin can manage invitations"
  on public.invitations for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Trigger: cuando un usuario acepta la invitación,
-- asignar el rol que tenía pendiente
create or replace function public.handle_invitation_accepted()
returns trigger as $$
begin
  -- Buscar si hay una invitación pendiente para este email
  update public.profiles
  set role = (
    select role from public.invitations
    where email = new.email
    limit 1
  )
  where id = new.id
    and exists (
      select 1 from public.invitations where email = new.email
    );

  -- Marcar invitación como aceptada
  update public.invitations
  set accepted = true
  where email = new.email;

  return new;
end;
$$ language plpgsql security definer;

-- Ejecutar el trigger cuando se crea un nuevo perfil
create trigger on_invitation_accepted
  after insert on public.profiles
  for each row execute procedure public.handle_invitation_accepted();


-- ============================================================
-- Variables de entorno a agregar en Vercel:
--   SUPABASE_SERVICE_ROLE_KEY  →  Supabase → Settings → API → service_role
--   NEXT_PUBLIC_APP_URL        →  https://tu-app.vercel.app
-- ============================================================
