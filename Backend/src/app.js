const express = require('express');
const cors = require('cors');

const app = express();
const { authMiddleware } = require('./middleware/auth')

app.use(cors());
app.use(express.json());

// rotas públicas (sem auth)
app.use('/auth', require('./routes/auth'))

// middleware JWT — protege tudo abaixo
app.use(authMiddleware)

// rotas protegidas
app.use('/users', require('./routes/users'))

module.exports = app
