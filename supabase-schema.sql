-- Jalankan seluruh file ini di Supabase Dashboard -> SQL Editor.
-- Auth > Providers > Email harus diaktifkan. Atur Site URL dan Redirect URLs
-- ke URL produksi aplikasi Anda (serta http://localhost:8000 saat pengembangan).

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (username ~ '^[A-Za-z0-9_.]{3,20}$'),
  created_at timestamptz not null default now()
);
create unique index if not exists profiles_username_lower_unique
  on public.profiles (lower(username));

create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now()
);
create index if not exists habits_owner_id_idx on public.habits (owner_id);

create table if not exists public.completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  habit_id uuid not null references public.habits(id) on delete cascade,
  date date not null check (date <= current_date),
  created_at timestamptz not null default now(),
  unique (user_id, habit_id, date)
);
-- Constraint UNIQUE di atas sudah menjadi indeks dengan user_id sebagai kolom pertama.
-- Indeks habit_id membantu pemeriksaan kepemilikan dan penghapusan cascade.
create index if not exists completions_habit_id_idx on public.completions (habit_id);

alter table public.profiles enable row level security;
alter table public.habits enable row level security;
alter table public.completions enable row level security;

-- Dapat dijalankan ulang tanpa gagal bila policy sudah pernah dibuat.
drop policy if exists "Profil sendiri dapat dibaca" on public.profiles;
drop policy if exists "Profil sendiri dapat dibuat" on public.profiles;
drop policy if exists "Habit milik sendiri" on public.habits;
drop policy if exists "Completion milik sendiri" on public.completions;

create policy "Profil sendiri dapat dibaca" on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
create policy "Profil sendiri dapat dibuat" on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);
create policy "Habit milik sendiri" on public.habits for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
create policy "Completion milik sendiri" on public.completions for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.habits h
      where h.id = habit_id and h.owner_id = (select auth.uid())
    )
  );

-- Membuat profil secara otomatis untuk setiap akun baru dari Supabase Auth.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username)
  values (new.id, new.raw_user_meta_data ->> 'username');
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Fungsi ini hanya dipanggil oleh trigger internal, bukan lewat API publik.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
