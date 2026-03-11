// ==========================================
// Supabase Configuration
// ==========================================
const SUPABASE_URL = 'https://wageblpodnhzvafmksxq.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_qbHk3nCNy-iZ9R-fPpxDAA_eoX6zjdX';

// Admin password hash (SHA-256)
const ADMIN_PASSWORD_HASH = 'abdf0e7bf2d79c141409febdf3a81ac0751a0c38ad8c7582e797259954299d4c';

// Initialize Supabase client
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
