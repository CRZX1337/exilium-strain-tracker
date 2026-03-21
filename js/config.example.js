// ==========================================
// Local Configuration Template
// ==========================================
// INSTRUCTIONS:
// 1. Copy this file to config.local.js
// 2. Replace the placeholder values below with your actual Supabase credentials
// 3. Never commit config.local.js - it should already be in .gitignore
// ==========================================

const SUPABASE_URL = 'YOUR_SUPABASE_URL_HERE';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY_HERE';

// Initialize Supabase client (global db variable)
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
