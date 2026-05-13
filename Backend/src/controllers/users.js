require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function getUsers() {
  const { data, error } = await supabase
    .from('Users')
    .select('*')

  if (error) console.error(error)
  else console.log(data)
}

getUsers()