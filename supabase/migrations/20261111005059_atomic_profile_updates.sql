create or replace function public.update_own_profile(
  p_user_id uuid,
  p_username text,
  p_display_name text,
  p_bio text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_user public.users%rowtype;
  v_profile public.user_profiles%rowtype;
begin
  if p_user_id is null
     or p_username is null
     or p_username !~ '^[a-z0-9_.]{3,24}$'
     or p_display_name is null
     or char_length(btrim(p_display_name)) < 2
     or char_length(p_display_name) > 80
     or char_length(coalesce(p_bio, '')) > 300 then
    raise exception 'Perfil no válido.' using errcode = '22023';
  end if;

  update public.users
     set username = lower(p_username), updated_at = now()
   where id = p_user_id and status = 'active'
   returning * into v_user;
  if not found then raise exception 'La cuenta no está disponible.' using errcode = '42501'; end if;

  update public.user_profiles
     set display_name = btrim(p_display_name), bio = coalesce(p_bio, ''), updated_at = now()
   where user_id = p_user_id
   returning * into v_profile;
  if not found then raise exception 'No se encontró el perfil de la cuenta.' using errcode = 'P0002'; end if;

  return jsonb_build_object(
    'id', v_user.id, 'email', v_user.email, 'username', v_user.username,
    'status', v_user.status, 'created_at', v_user.created_at,
    'display_name', v_profile.display_name, 'bio', v_profile.bio,
    'avatar_path', v_profile.avatar_path,
    'show_last_seen', v_profile.show_last_seen,
    'show_online_status', v_profile.show_online_status
  );
end;
$function$;

revoke all on function public.update_own_profile(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.update_own_profile(uuid, text, text, text) to service_role;
