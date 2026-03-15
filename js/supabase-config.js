// ==========================================
// Supabase Configuration
// ==========================================
const SUPABASE_URL = 'https://wageblpodnhzvafmksxq.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_qbHk3nCNy-iZ9R-fPpxDAA_eoX6zjdX';

// Initialize Supabase client
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ⚠️ SECURITY NOTE: Password verification moved to backend
// Previously: Frontend had exposed password hash (CRITICAL VULNERABILITY)
// Now: Uses Supabase Edge Function for secure verification
// Setup instructions:
// 1. Create Supabase Edge Function: verify-admin-password
// 2. In .env.local (dev only): Set VITE_ADMIN_PASSWORD_HASH
// 3. Production: Use Supabase Auth with RLS policies
