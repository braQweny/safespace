-- Per-session opt-out from approved summary context.
--
-- Until now the carried-over context was resolved per user on every message
-- turn: `/api/session/message` always read the newest approved, visible
-- summaries. A user who wanted to start a clean conversation had no way to say
-- so short of deleting the earlier session (which hard-deletes its transcript).
--
-- The choice now belongs to the session itself and is fixed at start time, so
-- a running conversation cannot silently gain context it started without.
-- `default true` keeps every existing row and the currently deployed code
-- (which never writes this column) on the previous behaviour.

alter table public.therapy_sessions
  add column uses_approved_context boolean not null default true;

comment on column public.therapy_sessions.uses_approved_context is
  'False when the owner explicitly started this session without approved summary context. Fixed at start time; never content.';

-- Column-level grants are the boundary here, so the new column has to be added
-- explicitly. Insert only: the flag is a start-time decision, not editable
-- mid-session.
grant insert (uses_approved_context) on table public.therapy_sessions to authenticated;
