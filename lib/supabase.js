import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_KEY;

if (!url || !serviceKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
}

// Service-role client — bypasses RLS. NEVER expose to the browser.
export const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});
