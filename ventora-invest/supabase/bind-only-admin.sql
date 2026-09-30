-- Execute DEPOIS de criar a conta windinvest@gmail.com no Supabase Auth.
-- Este script garante que APENAS o UUID desta conta esteja autorizado como admin.

do $$
declare
  v_user uuid;
begin
  select id into v_user from auth.users where lower(email)=lower('windinvest@gmail.com') order by created_at asc limit 1;
  if v_user is null then
    raise exception 'Crie primeiro windinvest@gmail.com em Authentication > Users e rode este SQL novamente.';
  end if;

  delete from private.admin_users where user_id <> v_user;
  insert into private.admin_users(user_id,email)
  values(v_user,'windinvest@gmail.com')
  on conflict(user_id) do update set email=excluded.email;

  update public.profiles set role='USER' where role='ADMIN' and id<>v_user;
  update public.profiles set role='ADMIN',updated_at=now() where id=v_user;
end $$;

select p.id,p.email,p.role,
       exists(select 1 from private.admin_users a where a.user_id=p.id) as admin_bound
from public.profiles p
where lower(p.email)=lower('windinvest@gmail.com');
