-- Stage 7: atomic messaging and group operations.
-- Applied to the Supabase project with execute_sql. Re-running is safe because
-- each routine uses CREATE OR REPLACE and the grants are explicitly reset.
-- These are SECURITY INVOKER routines. The Edge Function validates the custom
-- opaque session, derives the user ID server-side, and calls these routines
-- using the server-only secret key. Never expose that key to the browser.

create or replace function public.send_message_atomic(
  p_sender_id uuid,
  p_conversation_id uuid,
  p_body text,
  p_client_nonce uuid,
  p_reply_to uuid,
  p_attachment_ids uuid[]
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_message public.messages%rowtype;
  v_existing public.messages%rowtype;
  v_attachment_count integer;
  v_other_ids uuid[];
  v_preview text;
begin
  if p_sender_id is null or p_conversation_id is null or p_client_nonce is null then
    raise exception 'Solicitud de mensaje no válida.' using errcode = '22023';
  end if;
  if char_length(coalesce(p_body, '')) > 4000 then
    raise exception 'El mensaje supera el límite permitido.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_body, ''))) = 0
     and coalesce(cardinality(p_attachment_ids), 0) = 0 then
    raise exception 'El mensaje no puede estar vacío.' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_attachment_ids), 0) > 5 then
    raise exception 'Demasiados archivos adjuntos.' using errcode = '22023';
  end if;

  perform 1 from public.conversation_members
  where conversation_id = p_conversation_id and user_id = p_sender_id and left_at is null;
  if not found then
    raise exception 'No tienes acceso a esta conversación.' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.conversation_members cm
    join public.blocked_users b
      on (b.blocker_id = p_sender_id and b.blocked_id = cm.user_id)
      or (b.blocker_id = cm.user_id and b.blocked_id = p_sender_id)
    where cm.conversation_id = p_conversation_id
      and cm.left_at is null and cm.user_id <> p_sender_id
  ) then
    raise exception 'No puedes enviar mensajes en esta conversación por una restricción de bloqueo.' using errcode = '42501';
  end if;

  if p_reply_to is not null and not exists (
    select 1 from public.messages
    where id = p_reply_to and conversation_id = p_conversation_id and deleted_at is null
  ) then
    raise exception 'El mensaje al que respondes no pertenece a esta conversación.' using errcode = '22023';
  end if;

  select * into v_existing from public.messages
  where sender_id = p_sender_id and client_nonce = p_client_nonce;
  if found then
    if v_existing.conversation_id <> p_conversation_id then
      raise exception 'La clave de envío ya fue utilizada en otra conversación.' using errcode = '23505';
    end if;
    return to_jsonb(v_existing) || jsonb_build_object('duplicate', true);
  end if;

  if coalesce(cardinality(p_attachment_ids), 0) > 0 then
    select count(distinct id)::integer into v_attachment_count
    from public.message_attachments
    where id = any(p_attachment_ids)
      and user_id = p_sender_id and conversation_id = p_conversation_id
      and message_id is null and deleted_at is null;
    if v_attachment_count <> cardinality(p_attachment_ids) then
      raise exception 'Uno de los archivos no está disponible para esta conversación.' using errcode = '42501';
    end if;
  end if;

  insert into public.messages(
    conversation_id, sender_id, body, message_type, reply_to, client_nonce
  ) values (
    p_conversation_id, p_sender_id, btrim(coalesce(p_body, '')),
    case when coalesce(cardinality(p_attachment_ids), 0) > 0 then 'file' else 'text' end,
    p_reply_to, p_client_nonce
  ) on conflict (sender_id, client_nonce) do nothing
  returning * into v_message;

  if v_message.id is null then
    select * into v_existing from public.messages
    where sender_id = p_sender_id and client_nonce = p_client_nonce;
    if v_existing.id is null or v_existing.conversation_id <> p_conversation_id then
      raise exception 'No se pudo confirmar el envío idempotente.' using errcode = '23505';
    end if;
    return to_jsonb(v_existing) || jsonb_build_object('duplicate', true);
  end if;

  if coalesce(cardinality(p_attachment_ids), 0) > 0 then
    update public.message_attachments set message_id = v_message.id
    where id = any(p_attachment_ids) and user_id = p_sender_id
      and conversation_id = p_conversation_id and message_id is null;
    get diagnostics v_attachment_count = row_count;
    if v_attachment_count <> cardinality(p_attachment_ids) then
      raise exception 'No se pudieron vincular todos los archivos.' using errcode = '42501';
    end if;
  end if;

  v_preview := case
    when char_length(btrim(coalesce(p_body, ''))) > 0 then left(btrim(p_body), 180)
    when coalesce(cardinality(p_attachment_ids), 0) > 0 then 'Archivo adjunto'
    else 'Mensaje'
  end;
  update public.conversations
  set last_message_at = v_message.created_at,
      last_message_preview = v_preview,
      updated_at = now()
  where id = p_conversation_id;

  select coalesce(array_agg(user_id), array[]::uuid[]) into v_other_ids
  from public.conversation_members
  where conversation_id = p_conversation_id and left_at is null and user_id <> p_sender_id;

  if cardinality(v_other_ids) > 0 then
    insert into public.message_receipts(message_id, user_id)
    select v_message.id, x from unnest(v_other_ids) as x
    on conflict (message_id, user_id) do nothing;
    insert into public.notifications(user_id, actor_id, kind, entity_id, title, body)
    select x, p_sender_id, 'new_message', p_conversation_id, 'Nuevo mensaje', left(v_preview, 160)
    from unnest(v_other_ids) as x;
  end if;

  return to_jsonb(v_message) || jsonb_build_object('duplicate', false);
end;
$function$;

create or replace function public.edit_conversation_message(
  p_user_id uuid, p_message_id uuid, p_body text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare v_message public.messages%rowtype;
begin
  if p_user_id is null or p_message_id is null
     or char_length(btrim(coalesce(p_body, ''))) = 0
     or char_length(coalesce(p_body, '')) > 4000 then
    raise exception 'Mensaje o contenido no válido.' using errcode = '22023';
  end if;
  select * into v_message from public.messages where id = p_message_id for update;
  if not found or v_message.sender_id <> p_user_id or v_message.deleted_at is not null
     or v_message.created_at < now() - interval '15 minutes'
     or not exists (
       select 1 from public.conversation_members
       where conversation_id = v_message.conversation_id and user_id = p_user_id and left_at is null
     ) then
    raise exception 'No puedes editar este mensaje.' using errcode = '42501';
  end if;
  update public.messages set body = btrim(p_body), edited_at = now(), updated_at = now()
  where id = p_message_id returning * into v_message;
  update public.conversations set last_message_preview = left(btrim(p_body), 180), updated_at = now()
  where id = v_message.conversation_id and last_message_at = v_message.created_at;
  return to_jsonb(v_message);
end;
$function$;

create or replace function public.delete_conversation_message(
  p_user_id uuid, p_message_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_message public.messages%rowtype;
  v_paths text[];
  v_last_body text;
  v_last_at timestamptz;
begin
  if p_user_id is null or p_message_id is null then
    raise exception 'Mensaje no válido.' using errcode = '22023';
  end if;
  select * into v_message from public.messages where id = p_message_id for update;
  if not found or v_message.sender_id <> p_user_id
     or not exists (
       select 1 from public.conversation_members
       where conversation_id = v_message.conversation_id and user_id = p_user_id and left_at is null
     ) then
    raise exception 'Solo puedes eliminar tus propios mensajes de conversaciones a las que perteneces.' using errcode = '42501';
  end if;
  if v_message.deleted_at is not null then
    return jsonb_build_object('deleted', true, 'objectPaths', '[]'::jsonb);
  end if;
  select coalesce(array_agg(object_path), array[]::text[]) into v_paths
  from public.message_attachments where message_id = p_message_id and deleted_at is null;
  update public.message_attachments set deleted_at = now()
  where message_id = p_message_id and deleted_at is null;
  update public.messages set deleted_at = now(), deleted_for_all = true, body = '', updated_at = now()
  where id = p_message_id;

  if exists (select 1 from public.conversations where id = v_message.conversation_id and last_message_at = v_message.created_at) then
    select body, created_at into v_last_body, v_last_at
    from public.messages where conversation_id = v_message.conversation_id and deleted_at is null
    order by created_at desc, id desc limit 1;
    update public.conversations
    set last_message_at = v_last_at,
        last_message_preview = case
          when v_last_at is null then null
          when char_length(btrim(coalesce(v_last_body, ''))) = 0 then 'Archivo adjunto'
          else left(btrim(v_last_body), 180)
        end,
        updated_at = now()
    where id = v_message.conversation_id;
  end if;
  return jsonb_build_object('deleted', true, 'conversationId', v_message.conversation_id, 'objectPaths', to_jsonb(v_paths));
end;
$function$;

create or replace function public.react_to_conversation_message(
  p_user_id uuid, p_message_id uuid, p_emoji text, p_remove boolean
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare v_conversation_id uuid;
begin
  if p_user_id is null or p_message_id is null or p_emoji is null
     or char_length(p_emoji) < 1 or char_length(p_emoji) > 16 then
    raise exception 'Reacción no válida.' using errcode = '22023';
  end if;
  select conversation_id into v_conversation_id from public.messages
  where id = p_message_id and deleted_at is null;
  if v_conversation_id is null or not exists (
    select 1 from public.conversation_members
    where conversation_id = v_conversation_id and user_id = p_user_id and left_at is null
  ) then
    raise exception 'No puedes reaccionar a este mensaje.' using errcode = '42501';
  end if;
  if p_remove then
    delete from public.message_reactions where message_id = p_message_id and user_id = p_user_id and emoji = p_emoji;
  else
    insert into public.message_reactions(message_id, user_id, emoji)
    values (p_message_id, p_user_id, p_emoji)
    on conflict (message_id, user_id, emoji) do nothing;
  end if;
  return true;
end;
$function$;

create or replace function public.create_group_conversation(
  p_owner_id uuid, p_title text, p_description text, p_member_ids uuid[]
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_conversation_id uuid;
  v_members uuid[];
  v_member uuid;
begin
  if p_owner_id is null or char_length(btrim(coalesce(p_title, ''))) < 2
     or char_length(p_title) > 80 or char_length(coalesce(p_description, '')) > 300 then
    raise exception 'Nombre o descripción de grupo no válidos.' using errcode = '22023';
  end if;
  select array_agg(distinct x order by x) into v_members
  from unnest(array_append(coalesce(p_member_ids, array[]::uuid[]), p_owner_id)) as x
  where x is not null;
  if coalesce(cardinality(v_members), 0) < 2 or cardinality(v_members) > 50 then
    raise exception 'El grupo debe tener entre 2 y 50 participantes.' using errcode = '22023';
  end if;
  perform 1 from public.users where id = p_owner_id and status = 'active';
  if not found then raise exception 'Cuenta no disponible.' using errcode = '42501'; end if;
  foreach v_member in array v_members loop
    perform 1 from public.users where id = v_member and status = 'active';
    if not found then raise exception 'Uno de los participantes no está disponible.' using errcode = 'P0002'; end if;
    if v_member <> p_owner_id then
      if exists (
        select 1 from public.blocked_users
        where (blocker_id = p_owner_id and blocked_id = v_member)
           or (blocker_id = v_member and blocked_id = p_owner_id)
      ) then raise exception 'No se puede agregar a uno de los participantes por una restricción de bloqueo.' using errcode = '42501'; end if;
      if not exists (
        select 1 from public.contacts
        where user_a = least(p_owner_id, v_member) and user_b = greatest(p_owner_id, v_member)
      ) then raise exception 'Todos los participantes deben estar en tus contactos.' using errcode = '42501'; end if;
    end if;
  end loop;
  insert into public.conversations(kind, title, created_by)
  values ('group', btrim(p_title), p_owner_id) returning id into v_conversation_id;
  insert into public.groups(conversation_id, description)
  values (v_conversation_id, coalesce(btrim(p_description), ''));
  insert into public.conversation_members(conversation_id, user_id, role)
  select v_conversation_id, x, case when x = p_owner_id then 'owner' else 'member' end
  from unnest(v_members) as x;
  insert into public.group_events(conversation_id, actor_id, event_type, details)
  values (v_conversation_id, p_owner_id, 'group_created', jsonb_build_object('title', btrim(p_title), 'memberCount', cardinality(v_members)));
  return v_conversation_id;
end;
$function$;

create or replace function public.update_group_details(
  p_actor_id uuid, p_conversation_id uuid, p_title text, p_description text
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare v_role text; v_old_title text;
begin
  if char_length(btrim(coalesce(p_title, ''))) < 2 or char_length(p_title) > 80
     or char_length(coalesce(p_description, '')) > 300 then
    raise exception 'Nombre o descripción de grupo no válidos.' using errcode = '22023';
  end if;
  select role into v_role from public.conversation_members
  where conversation_id = p_conversation_id and user_id = p_actor_id and left_at is null for update;
  if v_role is null or v_role not in ('owner', 'admin') or not exists (
    select 1 from public.conversations where id = p_conversation_id and kind = 'group'
  ) then raise exception 'No tienes permisos para modificar este grupo.' using errcode = '42501'; end if;
  select title into v_old_title from public.conversations where id = p_conversation_id;
  update public.conversations set title = btrim(p_title), updated_at = now()
  where id = p_conversation_id and kind = 'group';
  update public.groups set description = coalesce(btrim(p_description), ''), updated_at = now()
  where conversation_id = p_conversation_id;
  insert into public.group_events(conversation_id, actor_id, event_type, details)
  values (p_conversation_id, p_actor_id, 'group_updated', jsonb_build_object('previousTitle', v_old_title, 'title', btrim(p_title)));
  return true;
end;
$function$;

create or replace function public.set_group_avatar(
  p_actor_id uuid, p_conversation_id uuid, p_avatar_path text
)
returns text
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare v_role text; v_old_path text;
begin
  select role into v_role from public.conversation_members
  where conversation_id = p_conversation_id and user_id = p_actor_id and left_at is null for update;
  if v_role is null or v_role not in ('owner', 'admin') or not exists (
    select 1 from public.conversations where id = p_conversation_id and kind = 'group'
  ) then raise exception 'No tienes permisos para cambiar la fotografía del grupo.' using errcode = '42501'; end if;
  if p_avatar_path is not null and p_avatar_path !~ ('^groups/' || p_conversation_id::text || '/[0-9a-f-]+/[0-9a-f-]+\.(jpg|png|webp|gif)$') then
    raise exception 'Ruta de fotografía no válida.' using errcode = '22023';
  end if;
  select avatar_path into v_old_path from public.conversations where id = p_conversation_id for update;
  update public.conversations set avatar_path = p_avatar_path, updated_at = now()
  where id = p_conversation_id and kind = 'group';
  insert into public.group_events(conversation_id, actor_id, event_type, details)
  values (p_conversation_id, p_actor_id, case when p_avatar_path is null then 'group_avatar_removed' else 'group_avatar_updated' end, '{}'::jsonb);
  return v_old_path;
end;
$function$;

create or replace function public.add_group_member(
  p_actor_id uuid, p_conversation_id uuid, p_target_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare v_role text;
begin
  if p_actor_id is null or p_conversation_id is null or p_target_id is null or p_target_id = p_actor_id then raise exception 'Participante no válido.' using errcode = '22023'; end if;
  select role into v_role from public.conversation_members
  where conversation_id = p_conversation_id and user_id = p_actor_id and left_at is null for update;
  if v_role is null or v_role not in ('owner', 'admin') or not exists (
    select 1 from public.conversations where id = p_conversation_id and kind = 'group'
  ) then raise exception 'No tienes permisos para agregar participantes.' using errcode = '42501'; end if;
  perform 1 from public.users where id = p_target_id and status = 'active';
  if not found then raise exception 'El usuario no está disponible.' using errcode = 'P0002'; end if;
  if exists (
    select 1 from public.blocked_users
    where (blocker_id = p_actor_id and blocked_id = p_target_id)
       or (blocker_id = p_target_id and blocked_id = p_actor_id)
  ) then raise exception 'No se puede agregar a este usuario por una restricción de bloqueo.' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.contacts
    where user_a = least(p_actor_id, p_target_id) and user_b = greatest(p_actor_id, p_target_id)
  ) then raise exception 'Solo puedes agregar a tus contactos.' using errcode = '42501'; end if;
  if exists (
    select 1 from public.conversation_members
    where conversation_id = p_conversation_id and user_id = p_target_id and left_at is null
  ) then raise exception 'El usuario ya forma parte del grupo.' using errcode = '23505'; end if;
  insert into public.conversation_members(conversation_id, user_id, role, joined_at, left_at, last_read_at)
  values (p_conversation_id, p_target_id, 'member', now(), null, null)
  on conflict (conversation_id, user_id)
  do update set role = 'member', joined_at = now(), left_at = null, last_read_at = null;
  insert into public.group_events(conversation_id, actor_id, event_type, target_user_id)
  values (p_conversation_id, p_actor_id, 'member_added', p_target_id);
  insert into public.notifications(user_id, actor_id, kind, entity_id, title, body)
  values (p_target_id, p_actor_id, 'group_invite', p_conversation_id, 'Te agregaron a un grupo', 'Ahora formas parte de una conversación grupal.');
  return true;
end;
$function$;

create or replace function public.remove_group_member(
  p_actor_id uuid, p_conversation_id uuid, p_target_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_actor_role text; v_target_role text; v_successor_id uuid;
begin
  if p_actor_id is null or p_target_id is null then raise exception 'Participante no válido.' using errcode = '22023'; end if;
  perform 1 from public.conversations where id = p_conversation_id and kind = 'group' for update;
  if not found then raise exception 'Grupo no encontrado.' using errcode = 'P0002'; end if;
  select role into v_actor_role from public.conversation_members
  where conversation_id = p_conversation_id and user_id = p_actor_id and left_at is null for update;
  if v_actor_role is null then raise exception 'No perteneces a este grupo.' using errcode = '42501'; end if;
  select role into v_target_role from public.conversation_members
  where conversation_id = p_conversation_id and user_id = p_target_id and left_at is null for update;
  if v_target_role is null then raise exception 'El participante no está en el grupo.' using errcode = 'P0002'; end if;
  if p_target_id <> p_actor_id then
    if v_actor_role not in ('owner', 'admin') or v_target_role = 'owner'
       or (v_actor_role = 'admin' and v_target_role = 'admin') then
      raise exception 'No tienes permisos para retirar a este participante.' using errcode = '42501';
    end if;
  elsif v_actor_role = 'owner' then
    select user_id into v_successor_id from public.conversation_members
    where conversation_id = p_conversation_id and left_at is null and user_id <> p_actor_id
    order by case role when 'admin' then 0 else 1 end, joined_at asc limit 1 for update;
    if v_successor_id is not null then
      update public.conversation_members set role = 'owner'
      where conversation_id = p_conversation_id and user_id = v_successor_id;
      insert into public.group_events(conversation_id, actor_id, event_type, target_user_id)
      values (p_conversation_id, p_actor_id, 'ownership_transferred', v_successor_id);
    else
      delete from public.conversations where id = p_conversation_id;
      return jsonb_build_object('removed', true, 'groupDeleted', true);
    end if;
  end if;
  update public.conversation_members set left_at = now()
  where conversation_id = p_conversation_id and user_id = p_target_id and left_at is null;
  insert into public.group_events(conversation_id, actor_id, event_type, target_user_id)
  values (p_conversation_id, p_actor_id,
          case when p_target_id = p_actor_id then 'member_left' else 'member_removed' end, p_target_id);
  insert into public.notifications(user_id, actor_id, kind, entity_id, title, body)
  select p_target_id, p_actor_id, 'group_member_removed', p_conversation_id,
         case when p_target_id = p_actor_id then 'Saliste del grupo' else 'Te retiraron de un grupo' end,
         case when p_target_id = p_actor_id then 'Ya no formas parte de este grupo.' else 'Ya no formas parte de esta conversación grupal.' end
  where p_target_id <> p_actor_id;
  return jsonb_build_object('removed', true, 'groupDeleted', false, 'newOwnerId', v_successor_id);
end;
$function$;

create or replace function public.set_group_member_role(
  p_actor_id uuid, p_conversation_id uuid, p_target_id uuid, p_new_role text
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare v_actor_role text; v_target_role text;
begin
  if p_actor_id is null or p_conversation_id is null or p_target_id is null
     or p_new_role is null or p_new_role not in ('admin', 'member') or p_target_id = p_actor_id then
    raise exception 'Rol o participante no válido.' using errcode = '22023';
  end if;
  select role into v_actor_role from public.conversation_members
  where conversation_id = p_conversation_id and user_id = p_actor_id and left_at is null for update;
  if v_actor_role is null or v_actor_role <> 'owner' or not exists (
    select 1 from public.conversations where id = p_conversation_id and kind = 'group'
  ) then raise exception 'Solo el propietario puede administrar los roles.' using errcode = '42501'; end if;
  select role into v_target_role from public.conversation_members
  where conversation_id = p_conversation_id and user_id = p_target_id and left_at is null for update;
  if v_target_role is null or v_target_role = 'owner' then
    raise exception 'No se puede modificar el rol de este participante.' using errcode = '42501';
  end if;
  update public.conversation_members set role = p_new_role
  where conversation_id = p_conversation_id and user_id = p_target_id;
  insert into public.group_events(conversation_id, actor_id, event_type, target_user_id, details)
  values (p_conversation_id, p_actor_id,
          case when p_new_role = 'admin' then 'member_promoted' else 'member_demoted' end,
          p_target_id, jsonb_build_object('oldRole', v_target_role, 'newRole', p_new_role));
  return true;
end;
$function$;

-- Lock every RPC to the trusted Edge Function service role.
do $privileges$
declare fn text;
begin
  foreach fn in array array[
    'send_message_atomic(uuid,uuid,text,uuid,uuid,uuid[])',
    'edit_conversation_message(uuid,uuid,text)',
    'delete_conversation_message(uuid,uuid)',
    'react_to_conversation_message(uuid,uuid,text,boolean)',
    'create_group_conversation(uuid,text,text,uuid[])',
    'update_group_details(uuid,uuid,text,text)',
    'set_group_avatar(uuid,uuid,text)',
    'add_group_member(uuid,uuid,uuid)',
    'remove_group_member(uuid,uuid,uuid)',
    'set_group_member_role(uuid,uuid,uuid,text)'
  ] loop
    execute 'revoke all on function public.' || fn || ' from public, anon, authenticated';
    execute 'grant execute on function public.' || fn || ' to service_role';
  end loop;
end;
$privileges$;
