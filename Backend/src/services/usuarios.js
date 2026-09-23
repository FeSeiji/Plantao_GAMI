const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const ROLES_VALIDAS = ['anestesita_socio', 'anestesita_plantonista', 'tecnico', 'admin']
const ROLES_ANESTESISTA = ['anestesita_socio', 'anestesita_plantonista']

const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
]

// Valida e normaliza sigla, roles e CRM. Retorna { error } ou os valores normalizados.
// ignorarId: id do próprio usuário (na edição), para não acusar conflito de sigla/CRM com ele mesmo.
async function validarDadosUsuario({ sigla, roles, crm, crm_uf }, ignorarId = null) {
  const siglaNormalizada = String(sigla ?? '').toUpperCase()

  if (!/^[A-Z]{2}$/.test(siglaNormalizada)) {
    return { error: 'sigla deve conter exatamente 2 letras' }
  }

  let siglaQuery = supabase.from('profiles').select('id').eq('sigla', siglaNormalizada)
  if (ignorarId) siglaQuery = siglaQuery.neq('id', ignorarId)

  const { data: siglaExistente, error: siglaError } = await siglaQuery.maybeSingle()
  if (siglaError) throw siglaError
  if (siglaExistente) return { error: 'Sigla já está em uso' }

  if (!Array.isArray(roles)) {
    return { error: 'roles deve ser um array' }
  }

  const invalidas = roles.filter(r => !ROLES_VALIDAS.includes(r))
  if (invalidas.length > 0) {
    return { error: `Roles inválidas: ${invalidas.join(', ')}. Permitidas: ${ROLES_VALIDAS.join(', ')}` }
  }

  // Anestesistas precisam informar o CRM (número + UF); as demais roles não guardam CRM
  const exigeCrm = roles.some(r => ROLES_ANESTESISTA.includes(r))
  if (!exigeCrm) {
    return { sigla: siglaNormalizada, roles, crm: null, crm_uf: null }
  }

  if (!crm || !crm_uf) {
    return { error: 'crm e crm_uf são obrigatórios para anestesistas' }
  }

  const crmNormalizado = String(crm).replace(/\D/g, '')
  const crmUfNormalizada = String(crm_uf).toUpperCase()

  if (!/^\d{1,7}$/.test(crmNormalizado)) {
    return { error: 'crm deve conter apenas números (até 7 dígitos)' }
  }

  if (!UFS.includes(crmUfNormalizada)) {
    return { error: 'crm_uf inválida' }
  }

  let crmQuery = supabase.from('profiles').select('id').eq('crm', crmNormalizado).eq('crm_uf', crmUfNormalizada)
  if (ignorarId) crmQuery = crmQuery.neq('id', ignorarId)

  const { data: crmExistente, error: crmError } = await crmQuery.maybeSingle()
  if (crmError) throw crmError
  if (crmExistente) return { error: 'CRM já cadastrado' }

  return { sigla: siglaNormalizada, roles, crm: crmNormalizado, crm_uf: crmUfNormalizada }
}

// Cria o usuário no Supabase Auth e completa o profile com o CRM.
// Espera dados já validados por validarDadosUsuario. Retorna { user } ou { error, status }.
async function criarUsuario({ email, password, nome, sigla, roles, crm, crm_uf }) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // pula confirmação de email
    user_metadata: { nome, sigla },
    app_metadata: { roles } // roles controladas só pelo admin (service role)
  })

  if (error) return { error: error.message, status: 400 }

  // O profile é criado pelo trigger on_auth_user_created; aqui só completamos o CRM
  if (crm) {
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ crm, crm_uf })
      .eq('id', data.user.id)

    if (profileError) {
      console.error(profileError)
      // Desfaz a criação do usuário para não deixar anestesista sem CRM
      await supabase.auth.admin.deleteUser(data.user.id)
      return { error: 'Não foi possível salvar o CRM', status: 500 }
    }
  }

  return { user: data.user }
}

module.exports = { ROLES_VALIDAS, ROLES_ANESTESISTA, UFS, validarDadosUsuario, criarUsuario }
