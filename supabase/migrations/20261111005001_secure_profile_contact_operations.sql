create unique index if not exists contact_requests_pending_pair_uq
  on public.contact_requests (least(sender_id, receiver_id), greatest(sender_id, receiver_id))
  where status = 'pending';

create or replace function public.create_contact_request(p_sender_id uuid, p_receiver_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_existing public.contact_requests%rowtype;
  v_request_id uuid;
  v_low uuid;
  v_high uuid;
begin
  if p_sender_id is null or p_receiver_id is null or p_sender_id = p_receiver_id then
    raise exception 'Usuario no válido.' using errcode = '22023';
  end if;
  v_low := least(p_sender_id, p_receiver_id);
  v_high := greatest(p_sender_id, p_receiver_id);

  perform 1 from public.users where id = p_sender_id and status = 'active';
  if not found then raise exception 'Cuenta no disponible.' using errcode = '42501'; end if;
  perform 1 from public.users where id = p_receiver_id and status = 'active';
  if not found then raise exception 'Cuenta no disponible.' using errcode = 'P0002'; end if;

  if exists (
    select 1 from public.blocked_users
    where (blocker_id = p_sender_id and blocked_id = p_receiver_id)
       or (blocker_id = p_receiver_id and blocked_id = p_sender_id)
  ) then raise exception 'No es posible enviar esta solicitud.' using errcode = '42501'; end if;

  if exists (select 1 from public.contacts where user_a = v_low and user_b = v_high) then
    raise exception 'Este usuario ya está en tus contactos.' using errcode = '23505';
  end if;

  select * into v_existing
  from public.contact_requests
  where status = 'pending'
    and least(sender_id, receiver_id) = v_low
    and greatest(sender_id, receiver_id) = v_high
  for update;

  if found then
    if v_existing.sender_id = p_receiver_id and v_existing.receiver_id = p_sender_id then
      update public.contact_requests set status = 'accepted', updated_at = now()
      where id = v_existing.id and status = 'pending';
      insert into public.contacts(user_a, user_b) values (v_low, v_high)
      on conflict (user_a, user_b) do nothing;
      insert into public.notifications(user_id, actor_id, kind, entity_id, title, body)
      values (p_receiver_id, p_sender_id, 'contact_response', v_existing.id,
        'Solicitud aceptada', 'Tu solicitud de contacto fue aceptada.');
      return jsonb_build_object('status', 'accepted', 'requestId', v_existing.id);
    end if;
    raise exception 'Ya existe una solicitud pendiente.' using errcode = '23505';
  end if;

  insert into public.contact_requests(sender_id, receiver_id)
  values (p_sender_id, p_receiver_id) returning id into v_request_id;
  insert into public.notifications(user_id, actor_id, kind, entity_id, title, body)
  values (p_receiver_id, p_sender_id, 'contact_request', v_request_id,
    'Nueva solicitud de contacto', 'Quiere agregarte a sus contactos.');
  return jsonb_build_object('status', 'pending', 'requestId', v_request_id);
end;
$function$;

create or replace function public.respond_contact_request(p_request_id uuid, p_receiver_id uuid, p_decision text)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_request public.contact_requests%rowtype;
  v_status text;
begin
  if p_decision not in ('accept', 'reject') then
    raise exception 'Decisión no válida.' using errcode = '22023';
  end if;
  select * into v_request from public.contact_requests
  where id = p_request_id and receiver_id = p_receiver_id and status = 'pending'
  for update;
  if not found then raise exception 'La solicitud ya no está disponible.' using errcode = 'P0002'; end if;

  if p_decision = 'accept' and exists (
    select 1 from public.blocked_users
    where (blocker_id = p_receiver_id and blocked_id = v_request.sender_id)
       or (blocker_id = v_request.sender_id and blocked_id = p_receiver_id)
  ) then raise exception 'No se puede aceptar esta solicitud.' using errcode = '42501'; end if;

  v_status := case when p_decision = 'accept' then 'accepted' else 'rejected' end;
  update public.contact_requests set status = v_status, updated_at = now()
  where id = v_request.id and receiver_id = p_receiver_id and status = 'pending';
  if p_decision = 'accept' then
    insert into public.contacts(user_a, user_b)
    values (least(p_receiver_id, v_request.sender_id), greatest(p_receiver_id, v_request.sender_id))
    on conflict (user_a, user_b) do nothing;
  end if;
  insert into public.notifications(user_id, actor_id, kind, entity_id, title, body)
  values (v_request.sender_id, p_receiver_id, 'contact_response', v_request.id,
    case when p_decision = 'accept' then 'Solicitud aceptada' else 'Solicitud rechazada' end,
    case when p_decision = 'accept' then 'Tu solicitud de contacto fue aceptada.' else 'Tu solicitud de contacto fue rechazada.' end);
  return jsonb_build_object('status', v_status, 'requestId', v_request.id);
end;
$function$;

create or replace function public.manage_user_block(p_blocker_id uuid, p_target_id uuid, p_block boolean)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
begin
  if p_blocker_id is null or p_target_id is null or p_blocker_id = p_target_id then
    raise exception 'Usuario no válido.' using errcode = '22023';
  end if;
  if p_block then
    perform 1 from public.users where id = p_target_id and status = 'active';
    if not found then raise exception 'Usuario no disponible.' using errcode = 'P0002'; end if;
    insert into public.blocked_users(blocker_id, blocked_id) values (p_blocker_id, p_target_id)
    on conflict (blocker_id, blocked_id) do nothing;
    delete from public.contacts
    where user_a = least(p_blocker_id, p_target_id) and user_b = greatest(p_blocker_id, p_target_id);
    update public.contact_requests set status = 'cancelled', updated_at = now()
    where status = 'pending'
      and least(sender_id, receiver_id) = least(p_blocker_id, p_target_id)
      and greatest(sender_id, receiver_id) = greatest(p_blocker_id, p_target_id);
    return true;
  end if;
  delete from public.blocked_users where blocker_id = p_blocker_id and blocked_id = p_target_id;
  return false;
end;
$function$;

create or replace function public.remove_contact(p_user_id uuid, p_target_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare v_deleted integer;
begin
  if p_user_id is null or p_target_id is null or p_user_id = p_target_id then
    raise exception 'Usuario no válido.' using errcode = '22023';
  end if;
  delete from public.contacts
  where user_a = least(p_user_id, p_target_id) and user_b = greatest(p_user_id, p_target_id);
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$function$;

revoke all on function public.create_contact_request(uuid, uuid) from public, anon, authenticated;
revoke all on function public.respond_contact_request(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.manage_user_block(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.remove_contact(uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_contact_request(uuid, uuid) to service_role;
grant execute on function public.respond_contact_request(uuid, uuid, text) to service_role;
grant execute on function public.manage_user_block(uuid, uuid, boolean) to service_role;
grant execute on function public.remove_contact(uuid, uuid) to service_role;
