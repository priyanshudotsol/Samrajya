-- Kingdom-private chat over Supabase Realtime private channels (docs/ARCHITECTURE.md §10.5).
-- Run once in the SQL editor of your Supabase project. Then set
--   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY   (app/.env.local)
--   SUPABASE_JWT_SECRET                                       (server only; Project Settings → API → JWT secret)
--
-- Our route handler (app/api/chat/token) mints JWTs carrying `samrajya: { game, faction }` after
-- verifying a wallet signature and the Player PDA on-chain. These policies let such a token join
-- (read + broadcast) only the topic `samrajya:<game>:<faction>`.

-- Two kinds of topic per war:
--   samrajya:<game>:<faction>  the kingdom's private chat (only that kingdom's members)
--   samrajya:<game>:field      every member's warrior on the battlefield (any member of that war),
--                              until warriors move on-chain (IMPLEMENTATION_GUIDE Step 17)
create or replace function public.samrajya_topic_allowed(topic text)
returns boolean
language sql
stable
as $$
  select topic = 'samrajya:' || (auth.jwt() -> 'samrajya' ->> 'game') || ':' || (auth.jwt() -> 'samrajya' ->> 'faction')
      or topic = 'samrajya:' || (auth.jwt() -> 'samrajya' ->> 'game') || ':field';
$$;

-- Row level security is already on for realtime.messages in every Supabase project (and the table
-- belongs to Supabase, so `alter table` is not allowed here); the policies below are all we add.

drop policy if exists "samrajya kingdom read" on realtime.messages;
create policy "samrajya kingdom read"
  on realtime.messages for select
  to authenticated
  using (realtime.messages.extension in ('broadcast', 'presence') and public.samrajya_topic_allowed(realtime.topic()));

drop policy if exists "samrajya kingdom write" on realtime.messages;
create policy "samrajya kingdom write"
  on realtime.messages for insert
  to authenticated
  with check (realtime.messages.extension in ('broadcast', 'presence') and public.samrajya_topic_allowed(realtime.topic()));
