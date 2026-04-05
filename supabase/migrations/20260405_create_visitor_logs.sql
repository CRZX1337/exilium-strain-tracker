-- Migration: create_visitor_logs_table
-- Creates a table to log every visitor's IP address and metadata

CREATE TABLE IF NOT EXISTS public.visitor_logs (
    id          BIGSERIAL PRIMARY KEY,
    ip_address  TEXT NOT NULL,
    country     TEXT,
    city        TEXT,
    region      TEXT,
    isp         TEXT,
    user_agent  TEXT,
    page_url    TEXT,
    referrer    TEXT,
    visited_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.visitor_logs ENABLE ROW LEVEL SECURITY;

-- Allow anyone (anon + authenticated) to INSERT
CREATE POLICY "Allow anon insert visitor_logs"
    ON public.visitor_logs
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

-- Only authenticated users (admins) can SELECT
CREATE POLICY "Allow authenticated read visitor_logs"
    ON public.visitor_logs
    FOR SELECT
    TO authenticated
    USING (true);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_visitor_logs_ip   ON public.visitor_logs (ip_address);
CREATE INDEX IF NOT EXISTS idx_visitor_logs_time ON public.visitor_logs (visited_at DESC);
