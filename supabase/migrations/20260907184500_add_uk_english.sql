alter table public.sessions
  drop constraint if exists sessions_language_check,
  add constraint sessions_language_check
    check (language in ('en', 'en-gb', 'es', 'fr', 'de', 'pt', 'it'));

alter table public.run_tickets
  drop constraint if exists run_tickets_language_check,
  add constraint run_tickets_language_check
    check (language in ('en', 'en-gb', 'es', 'fr', 'de', 'pt', 'it'));

alter table public.challenges
  drop constraint if exists challenges_language_check,
  add constraint challenges_language_check
    check (language in ('en', 'en-gb', 'es', 'fr', 'de', 'pt', 'it'));

alter table public.practice_coaching_runs
  drop constraint if exists practice_coaching_runs_language_check,
  add constraint practice_coaching_runs_language_check
    check (language in ('en', 'en-gb', 'es', 'fr', 'de', 'pt', 'it'));

alter table public.passage_submissions
  drop constraint if exists passage_submissions_language_check,
  add constraint passage_submissions_language_check
    check (language in ('en', 'en-gb', 'es', 'fr', 'de', 'pt', 'it'));
