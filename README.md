# 🏥 Plantão — API Backend

API REST para gerenciamento de plantões hospitalares, construída com **Node.js**, **Express** e **Supabase**.

---

## 🚀 Tecnologias

- **Node.js** v18
- **Express** v5
- **Supabase** — Autenticação (Auth) + Banco de dados
- **Docker** + **Docker Compose**
- **Nodemon** — Hot reload em desenvolvimento

---

## 📁 Estrutura do Projeto

```
Plantão/
├── Backend/
│   ├── src/
│   │   ├── controllers/
│   │   │   ├── authController.js   # Login e registro de usuários
│   │   │   ├── users.js            # Listagem de usuários
│   │   │   └── healthController.js # Health check da API
│   │   ├── middleware/
│   │   │   └── auth.js             # Validação do JWT via Supabase
│   │   ├── routes/
│   │   │   ├── auth.js             # Rotas públicas de autenticação
│   │   │   ├── users.js            # Rotas protegidas de usuários
│   │   │   └── index.js            # Roteador principal
│   │   ├── app.js                  # Configuração do Express
│   │   └── server.js               # Entrypoint — sobe o servidor
│   ├── Dockerfile
│   ├── .env.example
│   └── package.json
├── docker-compose.yml
└── README.md
```

---

## ⚙️ Configuração

### 1. Variáveis de ambiente

Copie o arquivo de exemplo e preencha com suas credenciais do Supabase:

```bash
cp Backend/.env.example Backend/.env
```

```env
PORT=3000
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

> ⚠️ A `SUPABASE_SERVICE_ROLE_KEY` é uma chave administrativa — nunca exponha no frontend ou em repositórios públicos.

---

## ▶️ Rodando o projeto

### Com Docker (recomendado)

```bash
docker-compose up
```

A API ficará disponível em `http://localhost:3000`.

> O Docker monta o volume `./Backend/src`, então alterações no código reiniciam automaticamente via **nodemon**.

### Sem Docker

```bash
cd Backend
npm install
npm run dev
```

---

## 📡 Endpoints

### Públicos (sem autenticação)

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/health` | Health check da API |
| `POST` | `/auth/login` | Autenticação de usuário |
| `POST` | `/auth/register` | Cadastro de novo usuário |

### Protegidos (requer `Authorization: Bearer <token>`)

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/users` | Lista todos os usuários |

---

## 🔐 Autenticação

A API usa **JWT via Supabase Auth**. Após o login, inclua o token em todas as requisições protegidas:

```
Authorization: Bearer <access_token>
```

---

## 👤 Registro de Usuário

**POST** `/auth/register`

```json
{
  "email": "fulano@hospital.com",
  "password": "senha123",
  "nome": "Dr. Fulano",
  "roles": ["medico", "supervisor"]
}
```

**Roles disponíveis:** `medico` · `enfermeiro` · `tecnico` · `supervisor` · `admin`

> As roles são armazenadas em `app_metadata` no Supabase — apenas administradores (via service role key) podem alterá-las.

---

## 🔑 Login

**POST** `/auth/login`

```json
{
  "email": "fulano@hospital.com",
  "password": "senha123"
}
```

**Resposta:**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```
