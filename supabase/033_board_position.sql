-- Run this once in Supabase → SQL Editor, after 032.
--
-- Lets a PM order the cards inside a board column by hand, instead of taking
-- the default "soonest due date, then newest".
--
-- HOW THE TWO ORDERS LIVE TOGETHER
-- board_position is null on every existing row, and a column where every card
-- is null keeps the old behaviour exactly. The first time you move a card in a
-- column, the app writes a position for EVERY card in that column, in the order
-- they were already showing, and then applies your move. So a column is either
-- fully automatic or fully manual — never half sorted and half hand-placed,
-- which is the state that makes an ordering impossible to reason about.
--
-- A project that arrives in a manually-ordered column later has no position and
-- sorts to the bottom of it. New work landing at the end of a list you arranged
-- is the predictable outcome; jumping to a position you didn't choose isn't.

alter table projects add column if not exists board_position integer;

comment on column projects.board_position is
  'Manual order within a board column. Null = fall back to due date then created_at. Written for a whole column at once by set_board_order().';

create index if not exists projects_board_position_idx
  on projects (status, board_position) where board_position is not null;

-- ============================================================
-- Renumber a column in one statement
-- ============================================================
-- The client sends the column's ids in their new order and this assigns
-- 0..n-1. Doing it as one call rather than one update per card keeps the column
-- from being briefly half-renumbered if the browser is closed mid-drag, and
-- costs one round trip instead of twenty.
--
-- security INVOKER, not definer: the update has to run as the caller so RLS
-- still decides which projects they may reorder. A definer function here would
-- let any signed-in account reshuffle another client's board.
create or replace function public.set_board_order(p_ids uuid[])
returns bigint
language plpgsql
security invoker
as $$
declare
  updated bigint;
begin
  if p_ids is null or array_length(p_ids, 1) is null then
    return 0;
  end if;
  -- The board itself is capped at 300 cards; this is the matching bound so a
  -- crafted call can't ask for an unbounded rewrite.
  if array_length(p_ids, 1) > 300 then
    raise exception 'Too many projects in one reorder';
  end if;

  with new_order as (
    select id, (ord - 1)::int as pos
    from unnest(p_ids) with ordinality as t(id, ord)
  )
  update projects p
  set board_position = n.pos
  from new_order n
  where p.id = n.id;

  get diagnostics updated = row_count;
  -- Returned so the caller can tell a silent RLS refusal from a success: an
  -- update that matches no rows raises no error, it just does nothing.
  return updated;
end;
$$;

grant execute on function public.set_board_order(uuid[]) to authenticated;
