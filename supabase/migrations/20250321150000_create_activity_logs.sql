-- ==========================================
-- Migration: Create activity_logs table
-- Description: Track strain add/edit/delete actions
-- ==========================================

create table if not exists public.activity_logs (
    id uuid default gen_random_uuid() primary key,
    action_type text not null check (action_type in ('create', 'update', 'delete', 'login', 'logout', 'privacy_toggle')),
    strain_id uuid references public.strains(id) on delete set null,
    strain_name text,
    user_id uuid references auth.users(id) on delete set null,
    user_email text,
    details jsonb,
    created_at timestamptz default now()
);

-- Add index for faster querying
create index if not exists idx_activity_logs_created_at on public.activity_logs(created_at desc);
create index if not exists idx_activity_logs_user_id on public.activity_logs(user_id);
create index if not exists idx_activity_logs_action_type on public.activity_logs(action_type);
comment on table public.activity_logs is 'Tracks all strain modification activity by users';

-- Enable RLS (Row Level Security)
alter table public.activity_logs enable row level security;

-- Create policy for authenticated users to read logs
-- Note: These will be visible to all authenticated users via the app
-- since it's an admin panel feature

-- ==========================================
-- Migration: Create RLS policy for activity_logs
-- ==========================================

-- Drop existing policies if they exist (to make migration idempotent)
drop policy if exists "Allow authenticated users to view activity logs" on public.activity_logs;
drop policy if exists "Allow authenticated users to insert activity logs" on public.activity_logs;

create policy "Allow authenticated users to view activity logs"
    on public.activity_logs
    for select
    to authenticated
    using (true);

-- ==========================================
-- Migration: Create insert policy
-- ==========================================

create policy "Allow authenticated users to insert activity logs"
    on public.activity_logs
    for insert
    to authenticated
    with check (true);
