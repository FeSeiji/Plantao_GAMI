const { rateLimit, ipKeyGenerator } = require('express-rate-limit')

// Contadores em memória: zeram quando o servidor reinicia, o que basta com uma única instância no Render.

const QUINZE_MIN = 15 * 60 * 1000
const UMA_HORA = 60 * 60 * 1000

// IP + e-mail: no hospital todos saem pelo mesmo IP, então limitar só por IP bloquearia colegas
function porIpEEmail(req) {
  const email = String(req.body?.email ?? '').trim().toLowerCase()
  return `${ipKeyGenerator(req.ip)}:${email}`
}

function limitador({ janela, limite, mensagem, ...opcoes }) {
  return rateLimit({
    windowMs: janela,
    limit: limite,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res) => res.status(429).json({ error: mensagem }),
    ...opcoes,
  })
}

// Login: só as tentativas erradas contam
exports.limiteLoginPorConta = limitador({
  janela: QUINZE_MIN,
  limite: 5,
  keyGenerator: porIpEEmail,
  skipSuccessfulRequests: true,
  mensagem: 'Muitas tentativas de login. Aguarde 15 minutos e tente de novo.',
})

// Teto por IP, para quem testa muitos e-mails diferentes
exports.limiteLoginPorIp = limitador({
  janela: QUINZE_MIN,
  limite: 30,
  skipSuccessfulRequests: true,
  mensagem: 'Muitas tentativas de login. Aguarde 15 minutos e tente de novo.',
})

exports.limiteEsqueciSenha = limitador({
  janela: UMA_HORA,
  limite: 3,
  keyGenerator: porIpEEmail,
  mensagem: 'Muitos pedidos de redefinição de senha. Aguarde uma hora e tente de novo.',
})

exports.limiteCadastro = limitador({
  janela: UMA_HORA,
  limite: 10,
  mensagem: 'Muitos cadastros feitos desta rede. Aguarde uma hora e tente de novo.',
})
