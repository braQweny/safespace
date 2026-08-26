-- Admin state changes and their audit event must share one transaction. The
-- previous PostgREST flow updated the safe profile first and inserted the
-- audit row in a second request, which allowed unaudited state after a partial
-- failure.

create function public.set_private_admin_user_block_state(
  input_target_user_id uuid,
  input_action text,
  input_reason_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_profile public.admin_user_profiles%rowtype;
  created_audit_event public.admin_audit_events%rowtype;
begin
  if auth.uid() is null or not public.is_private_admin() then
    raise exception using errcode = '42501', message = 'active_admin_required';
  end if;

  if input_action is null or input_action not in ('block', 'unblock') then
    raise exception using errcode = '22023', message = 'invalid_admin_block_action';
  end if;

  if input_reason_code is null or input_reason_code not in (
    'policy_violation',
    'safety_risk',
    'abuse_prevention',
    'owner_request',
    'other'
  ) then
    raise exception using errcode = '22023', message = 'invalid_admin_block_reason';
  end if;

  update public.admin_user_profiles
  set
    blocked_at = case when input_action = 'block' then now() else null end,
    blocked_by = case when input_action = 'block' then (select auth.uid()) else null end,
    block_reason_code = case when input_action = 'block' then input_reason_code else null end
  where user_id = input_target_user_id
  returning * into changed_profile;

  if not found then
    raise exception using errcode = 'P0002', message = 'admin_target_not_found';
  end if;

  insert into public.admin_audit_events (
    admin_user_id,
    target_user_id,
    action,
    reason_code
  ) values (
    (select auth.uid()),
    input_target_user_id,
    case when input_action = 'block' then 'account_blocked' else 'account_unblocked' end,
    input_reason_code
  )
  returning * into created_audit_event;

  return jsonb_build_object(
    'profile', to_jsonb(changed_profile),
    'auditEvent', to_jsonb(created_audit_event)
  );
end;
$$;

create function public.set_private_admin_user_plan_state(
  input_target_user_id uuid,
  input_action text,
  input_reason_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_profile public.admin_user_profiles%rowtype;
  created_audit_event public.admin_audit_events%rowtype;
begin
  if auth.uid() is null or not public.is_private_admin() then
    raise exception using errcode = '42501', message = 'active_admin_required';
  end if;

  if input_action is null or input_action not in ('grant', 'revoke') then
    raise exception using errcode = '22023', message = 'invalid_admin_plan_action';
  end if;

  if input_reason_code is null or input_reason_code not in (
    'subscription_paid',
    'subscription_ended',
    'owner_request',
    'other'
  ) then
    raise exception using errcode = '22023', message = 'invalid_admin_plan_reason';
  end if;

  update public.admin_user_profiles
  set
    premium_granted_at = case when input_action = 'grant' then now() else null end,
    premium_granted_by = case when input_action = 'grant' then (select auth.uid()) else null end
  where user_id = input_target_user_id
  returning * into changed_profile;

  if not found then
    raise exception using errcode = 'P0002', message = 'admin_target_not_found';
  end if;

  insert into public.admin_audit_events (
    admin_user_id,
    target_user_id,
    action,
    reason_code
  ) values (
    (select auth.uid()),
    input_target_user_id,
    case when input_action = 'grant' then 'premium_granted' else 'premium_revoked' end,
    input_reason_code
  )
  returning * into created_audit_event;

  return jsonb_build_object(
    'profile', to_jsonb(changed_profile),
    'auditEvent', to_jsonb(created_audit_event)
  );
end;
$$;

-- Remove the old two-request write path. The functions use SECURITY DEFINER
-- only so the authenticated role no longer needs direct UPDATE/INSERT grants;
-- each function has an explicit active-admin check, an empty search_path and a
-- locked-down EXECUTE grant.
revoke update on table public.admin_user_profiles from authenticated;
revoke update (
  blocked_at,
  blocked_by,
  block_reason_code,
  premium_granted_at,
  premium_granted_by
) on table public.admin_user_profiles from authenticated;

revoke insert on table public.admin_audit_events from authenticated;
revoke insert (
  admin_user_id,
  target_user_id,
  action,
  reason_code
) on table public.admin_audit_events from authenticated;

-- Functions are executable by PUBLIC unless explicitly revoked.
revoke all on function public.set_private_admin_user_block_state(uuid, text, text) from public;
revoke all on function public.set_private_admin_user_block_state(uuid, text, text) from anon;
grant execute on function public.set_private_admin_user_block_state(uuid, text, text) to authenticated;

revoke all on function public.set_private_admin_user_plan_state(uuid, text, text) from public;
revoke all on function public.set_private_admin_user_plan_state(uuid, text, text) from anon;
grant execute on function public.set_private_admin_user_plan_state(uuid, text, text) to authenticated;
