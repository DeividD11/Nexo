-- Stage 9 — Files, notifications, preferences and performance indexes.
-- This SQL was already executed against the linked Supabase project using
-- the SQL execution tool. Keep this file as the repository migration record.

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS in_app_notifications boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sound_notifications boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS notifications_user_unread_created_idx
  ON public.notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS message_attachments_conversation_active_idx
  ON public.message_attachments (conversation_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Security state verified after deployment:
-- * public.message_attachments RLS is enabled and direct anon/authenticated access is denied.
-- * public.notifications RLS is enabled and direct anon/authenticated access is denied.
-- * public.user_settings RLS is enabled and direct anon/authenticated access is denied.
-- * public.user_sessions RLS is enabled and direct anon/authenticated access is denied.
-- * public.user_devices RLS is enabled and direct anon/authenticated access is denied.
-- * storage bucket messenger-private is not public; size cap is 10 MiB.
