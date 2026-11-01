-- Puzzleregal – Migration 0010: Schwierigkeit in den Regalen
-- Im Supabase SQL-Editor einmal ausführen (nach 0009), danach supabase/audit.sql.
-- Ergänzt die Regalfunktion um die Schwierigkeit, damit sich Regale danach sortieren lassen.

drop function public.shelf_items(uuid);
create function public.shelf_items(p_profile uuid)
returns table (copy_id uuid, puzzle_id uuid, title text, brand text, product_no text, piece_count integer,
               image_path text, owner_id uuid, owner_name text, holder_id uuid, holder_name text,
               is_on_loan boolean, is_lendable boolean, best_seconds integer, attempts_count integer,
               is_reserved boolean, is_with_guest boolean, guest_name text, guest_since timestamptz,
               difficulty smallint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_approved() then raise exception 'Nicht berechtigt' using errcode = '42501'; end if;
  return query
  select c.id, c.puzzle_id, p.title, p.brand, p.product_no, p.piece_count, p.image_path,
         c.owner_id, o.display_name, s.holder_id, h.display_name, s.is_on_loan, c.is_lendable,
         (select min(a.duration_seconds)::int from public.attempts a
            join public.attempt_participants ap on ap.attempt_id = a.id
           where a.puzzle_id = c.puzzle_id and a.team_size = 1 and ap.profile_id = p_profile),
         (select count(*)::int from public.attempts a
            join public.attempt_participants ap on ap.attempt_id = a.id
           where a.puzzle_id = c.puzzle_id and a.team_size = 1 and ap.profile_id = p_profile),
         s.is_reserved, s.is_with_guest, s.guest_name, s.guest_since, p.difficulty
  from public.copies c
  join public.puzzles p on p.id = c.puzzle_id
  join public.profiles o on o.id = c.owner_id
  join public.copy_current_state s on s.copy_id = c.id
  join public.profiles h on h.id = s.holder_id
  where c.owner_id = p_profile or s.holder_id = p_profile
  order by p.piece_count, p.title;
end $$;

grant execute on function public.shelf_items(uuid) to authenticated;
