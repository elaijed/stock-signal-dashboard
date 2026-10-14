import { createClient } from "@supabase/supabase-js";

// The publishable key is designed to ship in browser code. What keeps accounts
// private is Row Level Security: each signed-in user can only read/write their
// own rows; other people's data comes through filtered database functions
// (see supabase/001_social.sql).
const SUPABASE_URL = "https://ahiapflxxoxcgltkqyde.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_qfi4t3-F_2ylZkkIlDrPgQ_AOscEcj5";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
