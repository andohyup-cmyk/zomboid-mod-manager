-- Test-only additive category storage. No existing catalog rows modified.
create table public.categories (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id),
 name text not null check (char_length(btrim(name)) between 1 and 120 and name=btrim(name)),
 sort_order integer not null default 0 check (sort_order >= 0),
 unique(owner_id,id), unique(owner_id,name)
);
create table public.mod_categories (
 owner_id uuid not null,
 mod_id uuid not null,
 category_id uuid not null,
 primary key(mod_id,category_id),
 foreign key (owner_id,category_id) references public.categories(owner_id,id),
 foreign key (mod_id) references public.mods(id)
);
create table public.mod_category_primary (
 owner_id uuid not null,
 mod_id uuid primary key,
 category_id uuid not null,
 foreign key (mod_id,category_id) references public.mod_categories(mod_id,category_id)
   deferrable initially deferred
);
-- Cross-owner constraints enforced by RLS and deferred owner consistency trigger.
create function public.check_mod_category_consistency() returns trigger
language plpgsql security invoker set search_path='' as $$
declare v_mod uuid; v_owner uuid; v_count integer; v_primary uuid;
begin
 v_mod := coalesce(new.mod_id,old.mod_id);
 select owner_id into v_owner from public.mods where id=v_mod;
 if v_owner is null then return null; end if;
 select count(*) into v_count from public.mod_categories where mod_id=v_mod;
 select category_id into v_primary from public.mod_category_primary where mod_id=v_mod;
 if (v_count=0 and v_primary is not null) or (v_count>0 and v_primary is null) then
   raise exception 'PZ_CATEGORY_PRIMARY_REQUIRED' using errcode='PZ004';
 end if;
 if exists(select 1 from public.mod_categories mc join public.categories c on c.id=mc.category_id
   where mc.mod_id=v_mod and (mc.owner_id<>v_owner or c.owner_id<>v_owner)) or
   exists(select 1 from public.mod_category_primary p where p.mod_id=v_mod and p.owner_id<>v_owner) then
   raise exception 'PZ_CATEGORY_OWNER_MISMATCH' using errcode='42501';
 end if;
 return null;
end $$;
create constraint trigger mod_categories_consistency
 after insert or update or delete on public.mod_categories
 deferrable initially deferred for each row execute function public.check_mod_category_consistency();
create constraint trigger mod_category_primary_consistency
 after insert or update or delete on public.mod_category_primary
 deferrable initially deferred for each row execute function public.check_mod_category_consistency();

alter table public.categories enable row level security;
alter table public.mod_categories enable row level security;
alter table public.mod_category_primary enable row level security;
create policy "owner category read" on public.categories for select to authenticated
 using (owner_id=(select auth.uid()) and (select public.is_authorized_user()));
create policy "owner category create" on public.categories for insert to authenticated
 with check (owner_id=(select auth.uid()) and (select public.is_authorized_user()));
create policy "owner category edit" on public.categories for update to authenticated
 using (owner_id=(select auth.uid()) and (select public.is_authorized_user()))
 with check (owner_id=(select auth.uid()) and (select public.is_authorized_user()));
create policy "owner mod category read" on public.mod_categories for select to authenticated
 using (owner_id=(select auth.uid()) and (select public.is_authorized_user())
 and exists(select 1 from public.mods m where m.id=mod_id and m.owner_id=(select auth.uid())));
create policy "owner mod category insert" on public.mod_categories for insert to authenticated
 with check (owner_id=(select auth.uid()) and (select public.is_authorized_user())
 and exists(select 1 from public.mods m where m.id=mod_id and m.owner_id=(select auth.uid()))
 and exists(select 1 from public.categories c where c.id=category_id and c.owner_id=(select auth.uid())));
create policy "owner mod category delete" on public.mod_categories for delete to authenticated
 using (owner_id=(select auth.uid()) and (select public.is_authorized_user())
 and exists(select 1 from public.mods m where m.id=mod_id and m.owner_id=(select auth.uid())));
create policy "owner mod category primary read" on public.mod_category_primary for select to authenticated
 using (owner_id=(select auth.uid()) and (select public.is_authorized_user())
 and exists(select 1 from public.mods m where m.id=mod_id and m.owner_id=(select auth.uid())));
create policy "owner mod category primary insert" on public.mod_category_primary for insert to authenticated
 with check (owner_id=(select auth.uid()) and (select public.is_authorized_user())
 and exists(select 1 from public.mods m where m.id=mod_id and m.owner_id=(select auth.uid())));
create policy "owner mod category primary update" on public.mod_category_primary for update to authenticated
 using (owner_id=(select auth.uid()) and (select public.is_authorized_user()))
 with check (owner_id=(select auth.uid()) and (select public.is_authorized_user()));
create policy "owner mod category primary delete" on public.mod_category_primary for delete to authenticated
 using (owner_id=(select auth.uid()) and (select public.is_authorized_user()));
revoke all on public.categories,public.mod_categories,public.mod_category_primary from public,anon,authenticated;
grant select,insert on public.categories to authenticated;
grant update(name,sort_order) on public.categories to authenticated;
grant select,insert,delete on public.mod_categories to authenticated;
grant select,insert,delete on public.mod_category_primary to authenticated;
grant update(category_id) on public.mod_category_primary to authenticated;

create function public.save_mod_categories(p_mod_id uuid,p_category_ids uuid[],p_primary_category_id uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare v_owner uuid := (select auth.uid()); v_count integer;
begin
 if v_owner is null or not (select public.is_authorized_user()) then
  raise exception 'PZ_DENIED' using errcode='42501';
 end if;
 if p_mod_id is null or p_category_ids is null or p_primary_category_id is null
  or cardinality(p_category_ids) not between 1 and 64
  or array_position(p_category_ids,null) is not null
  or not p_primary_category_id=any(p_category_ids) then
  raise exception 'PZ_INVALID_CATEGORIES' using errcode='PZ002';
 end if;
 select count(distinct x) into v_count from unnest(p_category_ids) as x;
 if v_count<>cardinality(p_category_ids) then raise exception 'PZ_DUPLICATE_CATEGORY' using errcode='PZ002'; end if;
 perform 1 from public.mods where id=p_mod_id and owner_id=v_owner;
 if not found then raise exception 'PZ_UNKNOWN_MOD' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_mod_id::text,8291));
 select count(*) into v_count from public.categories where owner_id=v_owner and id=any(p_category_ids);
 if v_count<>cardinality(p_category_ids) then raise exception 'PZ_UNKNOWN_CATEGORY' using errcode='42501'; end if;
 delete from public.mod_category_primary where mod_id=p_mod_id and owner_id=v_owner;
 delete from public.mod_categories where mod_id=p_mod_id and owner_id=v_owner;
 insert into public.mod_categories(owner_id,mod_id,category_id)
 select v_owner,p_mod_id,x from unnest(p_category_ids) as x;
 insert into public.mod_category_primary(owner_id,mod_id,category_id)
 values(v_owner,p_mod_id,p_primary_category_id);
end $$;
revoke all on function public.save_mod_categories(uuid,uuid[],uuid) from public,anon,authenticated;
grant execute on function public.save_mod_categories(uuid,uuid[],uuid) to authenticated;
