// ==========================================
// Supabase Configuration
// ==========================================
const SUPABASE_URL = 'https://wageblpodnhzvafmksxq.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_qbHk3nCNy-iZ9R-fPpxDAA_eoX6zjdX';

// Initialize Supabase client
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
