-- Test DB migration draft (project smofdbjgcgdmscamknpw ONLY): owner-scoped selection groups.
-- Additive only. Default rule = free selection (min/max NULL = 0..N). No profile is auto-modified.
-- Groups are independent of categories/tags; members reference concrete Mod ID rows (Workshop ID ≠ Mod ID).
create table public.selection_groups (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 label text not null check (char_length(btrim(label)) between 1 and 120 and label=btrim(label)),
 min_selected integer check (min_selected is null or min_selected >= 0),
 max_selected integer check (max_selected is null or max_selected >= 0),
 evidence_url text check (evidence_url is null or (evidence_url ~ '^https?://' and char_length(evidence_url) <= 500)),
 verified boolean not null default false,
 created_at timestamptz not null default now(),
 check (min_selected is null or max_selected is null or min_selected <= max_selected),
 unique(owner_id,id), unique(owner_id,label)
);
create table public.selection_group_members (
 owner_id uuid not null,
 group_id uuid not null,
 mod_id_ref uuid not null references public.mod_ids(id) on delete cascade,
 primary key(group_id,mod_id_ref),
 foreign key (owner_id,group_id) references public.selection_groups(owner_id,id) on delete cascade
);
create index selection_group_members_mod_idx on public.selection_group_members(mod_id_ref);

alter table public.selection_groups enable row level security;
alter table public.selection_group_members enable row level security;
create policy "owner selection group read" on public.selection_groups for select to authenticated
 using (owner_id=(select auth.uid()) and (select public.is_authorized_user()));
create policy "owner selection group create" on public.selection_groups for insert to authenticated
 with check (owner_id=(select auth.uid()) and (select public.is_authorized_user()));
create policy "owner selection group edit" on public.selection_groups for update to authenticated
 using (owner_id=(select auth.uid()) and (select public.is_authorized_user()))
 with check (owner_id=(select auth.uid()) and (select public.is_authorized_user()));
create policy "owner selection group delete" on public.selection_groups for delete to authenticated
 using (owner_id=(select auth.uid()) and (select public.is_authorized_user()));
create policy "owner selection group member read" on public.selection_group_members for select to authenticated
 using (owner_id=(select auth.uid()) and (select public.is_authorized_user()));
create policy "owner selection group member insert" on public.selection_group_members for insert to authenticated
 with check (owner_id=(select auth.uid()) and (select public.is_authorized_user())
 and exists(select 1 from public.selection_groups g where g.id=group_id and g.owner_id=(select auth.uid()))
 and exists(select 1 from public.mod_ids i join public.mods m on m.id=i.mod_id
   where i.id=mod_id_ref and m.owner_id=(select auth.uid())));
create policy "owner selection group member delete" on public.selection_group_members for delete to authenticated
 using (owner_id=(select auth.uid()) and (select public.is_authorized_user()));
revoke all on public.selection_groups,public.selection_group_members from public,anon,authenticated;
grant select,insert,delete on public.selection_groups to authenticated;
grant update(label,min_selected,max_selected,evidence_url,verified) on public.selection_groups to authenticated;
grant select,insert,delete on public.selection_group_members to authenticated;

-- Atomic create/update. p_group_id NULL = create. Returns group id.
create or replace function public.save_selection_group(
 p_group_id uuid, p_label text, p_min integer, p_max integer, p_mod_id_refs uuid[]
) returns uuid language plpgsql security invoker set search_path='' as $$
declare
 v_owner uuid := (select auth.uid());
 v_id uuid := p_group_id;
 v_refs uuid[];
 v_count integer;
begin
 if v_owner is null or not (select public.is_authorized_user()) then
   raise exception 'PZ_DENIED' using errcode='42501';
 end if;
 select coalesce(array_agg(distinct r), '{}') into v_refs from unnest(coalesce(p_mod_id_refs,'{}')) r where r is not null;
 v_count := coalesce(array_length(v_refs,1),0);
 if v_count = 0 or v_count > 50 or v_count <> coalesce(array_length(p_mod_id_refs,1),0)
   or (p_max is not null and p_max > v_count) then
   raise exception 'PZ_INVALID_GROUP' using errcode='PZ002';
 end if;
 if (select count(*) from public.mod_ids i join public.mods m on m.id=i.mod_id
     where i.id = any(v_refs) and m.owner_id=v_owner) <> v_count then
   raise exception 'PZ_UNKNOWN_MOD_ID' using errcode='P0002';
 end if;
 if v_id is null then
   insert into public.selection_groups(owner_id,label,min_selected,max_selected)
   values (v_owner,p_label,p_min,p_max) returning id into v_id;
 else
   update public.selection_groups set label=p_label,min_selected=p_min,max_selected=p_max
   where id=v_id and owner_id=v_owner;
   if not found then raise exception 'PZ_UNKNOWN_GROUP' using errcode='P0002'; end if;
   delete from public.selection_group_members where group_id=v_id and owner_id=v_owner;
 end if;
 insert into public.selection_group_members(owner_id,group_id,mod_id_ref)
 select v_owner,v_id,r from unnest(v_refs) r;
 return v_id;
end $$;
revoke all on function public.save_selection_group(uuid,text,integer,integer,uuid[]) from public, anon, authenticated;
grant execute on function public.save_selection_group(uuid,text,integer,integer,uuid[]) to authenticated;
