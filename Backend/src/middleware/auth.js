const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

exports.authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token não fornecido' })
  }
  const token = authHeader.split(' ')[1]

  const { data: { user }, error } = await supabase.auth.getUser(token)

  if (error || !user) {
    return res.status(401).json({ error: 'Token inválido ou expirado' })
  }

  // Usuário desativado pela gestão de usuários: o token antigo ainda é válido até expirar
  if (user.banned_until && new Date(user.banned_until) > new Date()) {
    return res.status(401).json({ error: 'Usuário desativado' })
  }

  req.user = user
  next()
}

exports.requireRole = (...allowedRoles) => (req, res, next) => {
  const roles = req.user?.app_metadata?.roles ?? []

  if (!roles.some(role => allowedRoles.includes(role))) {
    return res.status(403).json({ error: 'Você não tem permissão para realizar esta ação' })
  }

  next()
}