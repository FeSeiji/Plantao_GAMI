const express = require('express');
const cors = require('cors');

const app = express();
const { authMiddleware } = require('./middleware/auth')

// Render fica atrás de um proxy: sem isso, req.ip é o IP do proxy e o limite de tentativas vale para todos juntos
app.set('trust proxy', 1)

// Só o frontend chama a API pelo navegador. CORS_ORIGINS aceita várias origens separadas por vírgula;
// sem ele, vale FRONTEND_URL.
const origensPermitidas = (process.env.CORS_ORIGINS || process.env.FRONTEND_URL || '')
  .split(',')
  .map(o => o.trim().replace(/\/+$/, ''))
  .filter(Boolean)

if (origensPermitidas.length === 0) {
  console.warn('CORS: nenhuma origem configurada (CORS_ORIGINS ou FRONTEND_URL). O navegador vai bloquear o frontend.')
}

app.use(cors({ origin: origensPermitidas }));
// /fichas lê o corpo no próprio router, depois do login, com um limite maior (fotos em base64)
const jsonPadrao = express.json();
app.use((req, res, next) => (req.path.startsWith('/fichas') ? next() : jsonPadrao(req, res, next)));

// rotas públicas (sem auth)
app.use('/health', require('./routes/health'))
app.use('/auth', require('./routes/auth'))

// middleware JWT — protege tudo abaixo
app.use(authMiddleware)

// rotas protegidas
app.use('/users', require('./routes/users'))
app.use('/plantoes', require('./routes/plantoes'))
app.use('/bm-financeiro', require('./routes/bmFinanceiro'))
app.use('/dashboard', require('./routes/dashboard'))
app.use('/afastamentos', require('./routes/afastamentos'))
app.use('/fichas', require('./routes/fichas'))
app.use('/casos-fora', require('./routes/casosFora'))
app.use('/hospitais', require('./routes/hospitais'))
app.use('/cirurgioes', require('./routes/cirurgioes'))

// Toda resposta é JSON, inclusive erro: a tela faz res.json() e, com o HTML padrão do Express,
// mostrava "Unexpected token <"
app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' })
})

// Express 5 manda para cá o erro de qualquer handler async que não foi tratado
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err)

  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'O corpo da requisição não é um JSON válido' })
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Envio grande demais. Tente uma foto menor.' })

  console.error(err)
  const status = err.status >= 400 && err.status < 500 ? err.status : 500
  res.status(status).json({ error: status === 500 ? 'Erro inesperado no servidor. Tente de novo.' : err.message })
})

module.exports = app
