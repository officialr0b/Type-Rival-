create table public.passage_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.players(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 80),
  text text not null check (char_length(text) between 120 and 1500),
  language text not null check (language in ('en', 'es', 'fr', 'de', 'pt', 'it')),
  category text not null check (category in ('balanced', 'science', 'history', 'geography', 'technology', 'business', 'sports', 'nature', 'health', 'arts', 'language')),
  source_name text check (source_name is null or char_length(source_name) <= 120),
  source_url text check (source_url is null or char_length(source_url) <= 500),
  rights_attested boolean not null check (rights_attested),
  content_hash text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  moderator_note text check (moderator_note is null or char_length(moderator_note) <= 1000),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, content_hash)
);

create index passage_submissions_user_created_idx
  on public.passage_submissions(user_id, created_at desc);
create index passage_submissions_pending_created_idx
  on public.passage_submissions(created_at asc)
  where status = 'pending';
create index if not exists feedback_submissions_user_created_idx
  on public.feedback_submissions(user_id, created_at desc);

alter table public.passage_submissions enable row level security;
revoke all on public.passage_submissions from public, anon, authenticated;
grant select, insert, update, delete on public.passage_submissions to service_role;

alter table public.challenges
  add column custom_title text,
  add column custom_text text,
  add column custom_category text,
  add column custom_source_name text,
  add column custom_source_url text;

alter table public.challenges
  add constraint challenges_custom_passage_check check (
    (custom_title is null and custom_text is null and custom_category is null)
    or (
      char_length(custom_title) between 3 and 80
      and char_length(custom_text) between 80 and 1500
      and custom_category in ('balanced', 'science', 'history', 'geography', 'technology', 'business', 'sports', 'nature', 'health', 'arts', 'language')
      and (custom_source_name is null or char_length(custom_source_name) <= 120)
      and (custom_source_url is null or char_length(custom_source_url) <= 500)
    )
  );
