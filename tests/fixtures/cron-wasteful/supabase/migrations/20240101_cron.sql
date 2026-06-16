-- Supabase pg_cron migration fixture
-- This fires every 2 minutes — overlaps with inngest-functions.ts */2 cron

SELECT cron.schedule('recon', '*/2 * * * *', $$
  SELECT reconcile_accounts();
$$);
