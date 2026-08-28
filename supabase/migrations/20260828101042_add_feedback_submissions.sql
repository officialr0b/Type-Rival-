create table if not exists public.feedback_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  category text not null check (category in ('bug', 'idea', 'experience', 'other')),
  message text not null check (char_length(message) between 10 and 2000),
  device text check (device is null or char_length(device) <= 120),
  created_at timestamptz not null default now()
);

create index if not exists idx_feedback_submissions_created_at
  on public.feedback_submissions(created_at desc);

alter table public.feedback_submissions enable row level security;

revoke all on public.feedback_submissions from public, anon, authenticated;
grant select, insert, update, delete on public.feedback_submissions to service_role;
