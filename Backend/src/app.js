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

module.exports = app
