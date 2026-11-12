-- Si existe el helper preconfigurado que activa RLS por evento DDL, impide
-- que los roles públicos puedan invocarlo a través de PostgREST RPC.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end $$;

-- Índices para claves foráneas no cubiertas por el prefijo de otro índice.
create index if not exists blocked_users_blocked_id_idx on public.blocked_users(blocked_id);
create index if not exists contact_requests_sender_id_idx on public.contact_requests(sender_id);
create index if not exists contacts_user_b_idx on public.contacts(user_b);
create index if not exists conversations_created_by_idx on public.conversations(created_by);
create index if not exists group_events_actor_id_idx on public.group_events(actor_id);
create index if not exists group_events_conversation_id_idx on public.group_events(conversation_id);
create index if not exists group_events_target_user_id_idx on public.group_events(target_user_id);
create index if not exists message_attachments_conversation_id_idx on public.message_attachments(conversation_id);
create index if not exists message_attachments_user_id_idx on public.message_attachments(user_id);
create index if not exists message_reactions_user_id_idx on public.message_reactions(user_id);
create index if not exists message_reports_message_id_idx on public.message_reports(message_id);
create index if not exists messages_reply_to_idx on public.messages(reply_to);
create index if not exists notifications_actor_id_idx on public.notifications(actor_id);
create index if not exists password_reset_tokens_user_id_idx on public.password_reset_tokens(user_id);
create index if not exists user_devices_user_id_idx on public.user_devices(user_id);
create index if not exists user_presence_typing_conversation_id_idx on public.user_presence(typing_conversation_id);
