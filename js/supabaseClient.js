/*
  Cliente Supabase compartilhado por todas as telas do Math Kids.
  A URL e a anon key ficam em js/config.js.
*/
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
