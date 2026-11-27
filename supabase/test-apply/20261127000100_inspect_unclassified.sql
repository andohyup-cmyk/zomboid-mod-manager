-- Read-only inspection of unclassified active mods and available categories in test DB.
select m.id as mod_id, m.workshop_id, m.title, m.short_description
from public.mods m
left join public.mod_category_primary p on p.mod_id = m.id
where m.is_archived = false and p.mod_id is null
order by m.workshop_id;

select id as category_id, name, sort_order
from public.categories
order by sort_order, name;
