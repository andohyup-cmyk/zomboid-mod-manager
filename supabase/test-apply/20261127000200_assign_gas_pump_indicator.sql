-- Assign unclassified mod GasPumpIndicator (Workshop 3755993986) to '기능·코드' (QoL/visual indicator code mod).
insert into public.mod_categories (owner_id, mod_id, category_id)
select m.owner_id, m.id, c.id
from public.mods m
join public.categories c on c.owner_id = m.owner_id and c.name = '기능·코드'
where m.workshop_id = '3755993986'
on conflict (mod_id, category_id) do nothing;

insert into public.mod_category_primary (owner_id, mod_id, category_id)
select m.owner_id, m.id, c.id
from public.mods m
join public.categories c on c.owner_id = m.owner_id and c.name = '기능·코드'
where m.workshop_id = '3755993986'
on conflict (mod_id) do update set category_id = excluded.category_id;

-- Verify remaining unclassified active mods count
select count(*) as unclassified_active_mods
from public.mods m
left join public.mod_category_primary p on p.mod_id = m.id
where m.is_archived = false and p.mod_id is null;
