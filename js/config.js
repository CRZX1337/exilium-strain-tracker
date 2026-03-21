// ==========================================
// Local Configuration (DO NOT COMMIT)
// ==========================================
// This file contains real credentials and is gitignored.
// Copy config.example.js to create this file.
// ==========================================

const SUPABASE_URL = 'https://wageblpodnhzvafmksxq.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_qbHk3nCNy-iZ9R-fPpxDAA_eoX6zjdX';

// Initialize Supabase client (global db variable)
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
