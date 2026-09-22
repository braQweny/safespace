-- Admin nie może zablokować ani zmienić planu własnego konta — także z
-- pominięciem aplikacji.
--
-- `src/lib/admin/users.ts` odmawia tego (`self_target_forbidden`), ale obie
-- funkcje SECURITY DEFINER są wykonywalne przez `authenticated`, więc admin
-- wołający je wprost przez PostgREST mógł zablokować sam siebie — a z takiej
-- blokady wyprowadza tylko SQL właściciela. Obie funkcje są skopiowane z
-- ostatniej definicji (`20260905175333`) z jedną zmianą: po sprawdzeniu roli
-- admina odmawiają celu równego `auth.uid()` z SQLSTATE `P0017`, który
-- aplikacja mapuje na ten sam `self_target_forbidden`.
--
-- Zgodna z wdrożonym kodem: aplikacja nigdy nie wysyła własnego id (odmawia
-- wcześniej), więc żadna jej ścieżka nie trafia na nowy błąd. Granty zostają
-- takie jak dotąd (`create or replace` je zachowuje; powtórzone jawnie).

create or replace function public.set_private_admin_user_block_state(
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

  if input_target_user_id = (select auth.uid()) then
    raise exception using errcode = 'P0017', message = 'admin_self_target_forbidden';
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
    'profile', to_jsonb(changed_profile) || jsonb_build_object('effective_premium', private.account_has_premium(changed_profile.user_id)),
    'auditEvent', to_jsonb(created_audit_event)
  );
end;
$$;

create or replace function public.set_private_admin_user_plan_state(
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

  if input_target_user_id = (select auth.uid()) then
    raise exception using errcode = 'P0017', message = 'admin_self_target_forbidden';
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
    'profile', to_jsonb(changed_profile) || jsonb_build_object('effective_premium', private.account_has_premium(changed_profile.user_id)),
    'auditEvent', to_jsonb(created_audit_event)
  );
end;
$$;

revoke all on function public.set_private_admin_user_block_state(uuid, text, text) from public, anon;
grant execute on function public.set_private_admin_user_block_state(uuid, text, text) to authenticated;

revoke all on function public.set_private_admin_user_plan_state(uuid, text, text) from public, anon;
grant execute on function public.set_private_admin_user_plan_state(uuid, text, text) to authenticated;
