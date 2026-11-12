-- Messenger Web: esquema propio. No usa Supabase Auth ni auth.uid().
-- Todas las operaciones de aplicación pasan por la Edge Function autenticada.
create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  username text not null,
  password_hash text not null,
  status text not null default 'active' check (status in ('active','suspended','deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists users_email_lower_uq on public.users (lower(email));
create unique index if not exists users_username_lower_uq on public.users (lower(username));

create table if not exists public.user_profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  display_name text not null,
  bio text not null default '',
  avatar_path text,
  show_last_seen boolean not null default true,
  show_online_status boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token_hash text not null unique,
  device_label text not null default 'Navegador',
  user_agent text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index if not exists user_sessions_user_active_idx on public.user_sessions(user_id, expires_at desc) where revoked_at is null;

create table if not exists public.password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.rate_limit_buckets (
  bucket_key text primary key,
  window_started_at timestamptz not null default now(),
  hit_count integer not null default 0 check (hit_count >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.contacts (
  user_a uuid not null references public.users(id) on delete cascade,
  user_b uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);

create table if not exists public.contact_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.users(id) on delete cascade,
  receiver_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','rejected','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sender_id <> receiver_id)
);
create unique index if not exists contact_requests_pending_pair_uq
  on public.contact_requests (least(sender_id, receiver_id), greatest(sender_id, receiver_id))
  where status = 'pending';
create index if not exists contact_requests_receiver_idx on public.contact_requests(receiver_id, status, created_at desc);

create table if not exists public.blocked_users (
  blocker_id uuid not null references public.users(id) on delete cascade,
  blocked_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('private','group')),
  title text,
  avatar_path text,
  private_pair_key text,
  created_by uuid not null references public.users(id),
  last_message_at timestamptz,
  last_message_preview text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'private' and private_pair_key is not null) or (kind = 'group' and private_pair_key is null))
);
create unique index if not exists conversations_private_pair_uq on public.conversations(private_pair_key) where private_pair_key is not null;
create index if not exists conversations_recent_idx on public.conversations(last_message_at desc nulls last);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  last_read_at timestamptz,
  muted_at timestamptz,
  primary key (conversation_id, user_id)
);
create index if not exists conversation_members_user_idx on public.conversation_members(user_id, left_at, conversation_id);

create table if not exists public.groups (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.users(id),
  body text not null default '',
  message_type text not null default 'text' check (message_type in ('text','image','file','system')),
  reply_to uuid references public.messages(id) on delete set null,
  client_nonce uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  deleted_for_all boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  unique(sender_id, client_nonce)
);
create index if not exists messages_conversation_recent_idx on public.messages(conversation_id, created_at desc, id desc) where deleted_at is null;
create index if not exists messages_sender_idx on public.messages(sender_id, created_at desc);

create table if not exists public.message_receipts (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  delivered_at timestamptz,
  read_at timestamptz,
  primary key (message_id, user_id)
);
create index if not exists message_receipts_unread_idx on public.message_receipts(user_id, read_at) where read_at is null;

create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create table if not exists public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid references public.messages(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  object_path text not null unique,
  file_name text not null,
  mime_type text not null,
  byte_size bigint not null check (byte_size > 0),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists message_attachments_message_idx on public.message_attachments(message_id) where deleted_at is null;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  actor_id uuid references public.users(id) on delete set null,
  kind text not null,
  entity_id uuid,
  title text not null,
  body text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_recent_idx on public.notifications(user_id, created_at desc);

create table if not exists public.user_settings (
  user_id uuid primary key references public.users(id) on delete cascade,
  theme text not null default 'system' check (theme in ('light','dark','system')),
  desktop_notifications boolean not null default false,
  message_previews boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.user_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  device_label text not null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.user_presence (
  user_id uuid primary key references public.users(id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  typing_conversation_id uuid references public.conversations(id) on delete set null,
  typing_until timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.group_events (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  actor_id uuid not null references public.users(id),
  event_type text not null,
  target_user_id uuid references public.users(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.message_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.users(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  reason text not null,
  details text not null default '',
  created_at timestamptz not null default now(),
  unique(reporter_id, message_id)
);

-- Rate limiter atómico. SECURITY INVOKER; ejecutable únicamente por service_role.
create or replace function public.consume_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare v_count integer;
begin
  insert into public.rate_limit_buckets(bucket_key, window_started_at, hit_count, updated_at)
  values (p_key, now(), 1, now())
  on conflict (bucket_key) do update
    set hit_count = case
      when public.rate_limit_buckets.window_started_at <= now() - make_interval(secs => p_window_seconds) then 1
      else public.rate_limit_buckets.hit_count + 1
    end,
    window_started_at = case
      when public.rate_limit_buckets.window_started_at <= now() - make_interval(secs => p_window_seconds) then now()
      else public.rate_limit_buckets.window_started_at
    end,
    updated_at = now()
  returning hit_count into v_count;
  return v_count <= p_limit;
end;
$$;
revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;

-- Defensa en profundidad: API directa cerrada; no se crean políticas para anon/authenticated.
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
    execute format('revoke all on table public.%I from anon, authenticated', t.tablename);
    execute format('grant all on table public.%I to service_role', t.tablename);
  end loop;
end $$;
grant usage on schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Bucket privado: los objetos se suben y descargan mediante la Edge Function.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'messenger-private',
  'messenger-private',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp','image/gif','application/pdf','text/plain','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/zip']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
