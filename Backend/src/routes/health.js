const express = require('express')
const { createClient } = require('@supabase/supabase-js')

const router = express.Router()
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Chamada de tempos em tempos por um monitor externo: mantém o Render acordado e,
// com a consulta leve ao banco, também conta como atividade no Supabase
router.get('/', async (req, res) => {
  const { error } = await supabase.from('profiles').select('id').limit(1)
  if (error) return res.status(503).json({ status: 'erro', banco: false })
  return res.json({ status: 'ok', banco: true })
})

module.exports = router
