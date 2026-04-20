-- ============================================================
-- PASO 1: Tabla de perfiles de usuario
-- ============================================================
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  role text default 'user' check (role in ('user', 'admin')),
  created_at timestamp with time zone default now()
);

-- Rellenar perfil automáticamente al registrarse
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- PASO 2: RLS en tabla profiles
-- ============================================================
alter table public.profiles enable row level security;

-- Cada usuario solo ve su propio perfil
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- Admin puede ver todos los perfiles
create policy "Admin can view all profiles"
  on public.profiles for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- ============================================================
-- PASO 3: Bucket de Storage
-- (Crear manualmente en Dashboard > Storage > New bucket)
-- Nombre: user-files | Tipo: Private
-- ============================================================

-- ============================================================
-- PASO 4: RLS en Storage
-- ============================================================

-- Cada usuario solo puede leer sus propios archivos
create policy "Users can read own files"
  on storage.objects for select
  using (
    bucket_id = 'user-files'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Cada usuario solo puede subir a su propia carpeta
create policy "Users can upload own files"
  on storage.objects for insert
  with check (
    bucket_id = 'user-files'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Cada usuario puede eliminar sus propios archivos
create policy "Users can delete own files"
  on storage.objects for delete
  using (
    bucket_id = 'user-files'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Admin puede leer TODOS los archivos
create policy "Admin can read all files"
  on storage.objects for select
  using (
    bucket_id = 'user-files'
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Admin puede eliminar CUALQUIER archivo
create policy "Admin can delete any file"
  on storage.objects for delete
  using (
    bucket_id = 'user-files'
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- ============================================================
-- PASO 5: Hacer admin a un usuario (reemplaza el email)
-- ============================================================
-- update public.profiles set role = 'admin' where email = 'tu@correo.com';
