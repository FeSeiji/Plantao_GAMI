import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY // use a service role key no backend

console.log('URL:', process.env.SUPABASE_URL)
console.log('KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 20))

export const supabase = createClient(supabaseUrl, supabaseKey)