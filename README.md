# 🏥 Plantão — GAMI

Sistema de gestão de plantões hospitalares do **GAMI (Grupo Anestesia Materno Infantil)**: escala de plantões, trocas entre médicos, gestão de usuários e o BM Financeiro mensal.

O projeto é dividido em duas aplicações:

- **Backend** — API REST em **Node.js** + **Express** + **Supabase**
- **Frontend** — aplicação web em **Next.js** + **Tailwind CSS**

---

## 🚀 Tecnologias

**Backend**
- **Node.js** v18+ (o `@supabase/supabase-js` recomenda v20+)
- **Express** v5
- **Supabase** — Autenticação (Auth) + Banco de dados (Postgres)
- **Docker** + **Docker Compose**
- **Nodemon** — Hot reload em desenvolvimento

**Frontend**
- **Next.js** 15 (App Router) + **React** 19
- **TypeScript**
- **Tailwind CSS** 3
- **ExcelJS** — exportação do BM Financeiro para `.xlsx`

**Deploy:** backend no **Render**, frontend na **Vercel**.

---

## 📁 Estrutura do Projeto

```
Plantão/
├── Backend/
│   ├── src/
│   │   ├── controllers/
│   │   │   ├── authController.js   # Login, cadastro, /me e redefinição de senha
│   │   │   ├── users.js            # Busca de médicos e gestão de usuários
│   │   │   ├── plantoes.js         # Plantões, equipes/filas e trocas
│   │   │   └── bmFinanceiro.js     # Resumo mensal de horas e pontos
│   │   ├── services/
│   │   │   └── usuarios.js         # Validação de sigla, roles e CRM
│   │   ├── middleware/
│   │   │   └── auth.js             # Validação do JWT e checagem de roles
│   │   ├── routes/                 # auth, users, plantoes, bmFinanceiro
│   │   ├── app.js                  # Configuração do Express
│   │   └── server.js               # Entrypoint — sobe o servidor
│   ├── Dockerfile
│   ├── .env.example
│   └── package.json
├── Frontend/
│   ├── app/
│   │   ├── page.tsx                # Página inicial (pública)
│   │   ├── login/ register/ forgot-password/ reset-password/
│   │   └── (app)/                  # Área logada (com sidebar)
│   │       ├── dashboard/
│   │       ├── plantoes/           # Calendário de plantões
│   │       ├── usuarios/           # Gestão de usuários
│   │       └── bm-financeiro/      # BM Financeiro
│   ├── components/                 # Modais, calendário, sidebar, badges
│   ├── public/                     # Logos da GAMI
│   ├── .env.example
│   └── package.json
├── docker-compose.yml
└── README.md
```

---

## ⚙️ Configuração

### Backend

```bash
cp Backend/.env.example Backend/.env
```

```env
PORT=3000
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
# URL do frontend, usada no link de redefinição de senha enviado por e-mail
FRONTEND_URL=http://localhost:3001
```

> ⚠️ A `SUPABASE_SERVICE_ROLE_KEY` é uma chave administrativa (ignora o RLS) — nunca exponha no frontend ou em repositórios públicos.

### Frontend

```bash
cp Frontend/.env.example Frontend/.env.local
```

```env
NEXT_PUBLIC_API_URL=http://localhost:3000
```

### Banco de dados

O projeto **não tem migrations**. Mudanças de schema (tabelas `profiles`, `plantoes`, `plantao_usuarios`, `plantao_trocas`) são aplicadas manualmente pelo **SQL Editor** do Supabase.

---

## ▶️ Rodando o projeto

### Backend com Docker (recomendado)

```bash
docker-compose up
```

A API ficará disponível em `http://localhost:3000`.

> O Docker monta o volume `./Backend/src`, então alterações no código reiniciam automaticamente via **nodemon**.

### Backend sem Docker

```bash
cd Backend
npm install
npm run dev   # hot reload
npm start     # produção
```

### Frontend

```bash
cd Frontend
npm install
npm run dev -- -p 3001
```

O frontend ficará disponível em `http://localhost:3001` (a porta 3000 é usada pela API).

---

## 👥 Perfis de acesso (roles)

| Role | Descrição |
|------|-----------|
| `anestesita_socio` | Anestesista sócio — trabalha em plantões de sócio (fila por posição) |
| `anestesita_plantonista` | Anestesista plantonista — trabalha em plantões de plantonista (equipe) |
| `tecnico` | Técnico — gestão de usuários |
| `admin` | Administrador |

- As roles ficam em `app_metadata` no Supabase — só a service role key consegue alterá-las.
- Anestesistas precisam informar **CRM** (até 7 dígitos) + **UF** no cadastro.
- Todo usuário tem uma **sigla** única de 2 letras, exibida nos badges do calendário.

---

## 📅 Funcionalidades

### Plantões
Existem dois tipos de plantão:
- **Plantonista** — uma equipe de médicos, sem limite de tamanho, com **um coordenador obrigatório**.
- **Sócio** — uma fila de até 7 médicos, cada um numa **posição de 1 a 7**.

Qualquer anestesista pode entrar em qualquer tipo de plantão, e um médico não pode estar em dois plantões com horários sobrepostos. O calendário tem visões de **semana** e **mês** e filtro por tipo.

### Trocas de plantão
Substituir um médico num slot já ocupado cria uma **solicitação de troca**. A troca só vale depois que o médico que entra **aceita**, e enquanto isso o médico que sai continua no plantão. Adicionar alguém num slot vazio não precisa de aceite. O sino de notificações mostra as trocas pendentes para o usuário logado.

### Gestão de usuários
Tela para listar, criar e editar usuários, ativar/desativar contas e enviar e-mail de redefinição de senha.
- **Visualizar:** `admin`, `anestesita_socio`, `tecnico`
- **Editar:** `admin`, `tecnico` (o técnico não edita administradores)

### Dashboard
Painel pessoal de cada usuário: próximo plantão (com contagem regressiva e papel na equipe/fila), agenda dos próximos 7 dias, trocas aguardando o seu aceite (com Aceitar/Recusar), trocas que você pediu e o resumo do seu mês em horas/pontos. Os dados vêm de um único endpoint e mostram só o que é do próprio usuário.

Para `admin` e `tecnico`, o dashboard também mostra a **visão da gestão**: quem está de plantão agora, alertas de cobertura dos próximos 7 dias (fila de sócio incompleta, plantão sem médico ou sem coordenador), trocas pendentes no sistema, resumo do mês comparado ao anterior, top 5 em horas e pontos e a equipe cadastrada por role.

### BM Financeiro
Resumo mensal por médico, calculado na hora a partir dos plantões (nada é gravado):
- **Plantonista** — soma das **horas trabalhadas**. Plantões que viram a noite contam inteiros no mês em que começam.
- **Sócio** — soma de **pontos por posição**: posição 1 = 7 pts, 2 = 6 pts … 7 = 1 pt.

Tem seletor de mês, busca por médico e **exportação para Excel** (uma aba por tipo). Acesso: `admin`, `anestesita_socio` e `tecnico`.

---

## 📡 Endpoints

A API usa **JWT via Supabase Auth**. Após o login, inclua o token nas requisições protegidas:

```
Authorization: Bearer <access_token>
```

### Públicos

| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/auth/login` | Login — retorna `{ token }` |
| `POST` | `/auth/register` | Cadastro de usuário |
| `POST` | `/auth/forgot-password` | Envia e-mail de redefinição de senha |
| `POST` | `/auth/reset-password` | Define a nova senha (`access_token` + `password`) |

### Protegidos

**Autenticação**

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/auth/me` | Dados do usuário logado (`id`, `email`, `nome`, `sigla`, `roles`) |

**Usuários**

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/users` | Busca de médicos (`?search=`, `?role=`, filtro de conflito de horário) |
| `GET` | `/users/gestao` | Lista para a gestão de usuários |
| `POST` | `/users` | Cria usuário |
| `PATCH` | `/users/:id` | Edita nome, sigla, roles e CRM |
| `PATCH` | `/users/:id/ativo` | Ativa/desativa usuário |
| `POST` | `/users/:id/reset-senha` | Envia e-mail de redefinição de senha |

**Plantões**

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/plantoes` | Lista plantões (`?inicio=`, `?fim=`, `?tipo=`) |
| `GET` | `/plantoes/:id` | Detalhe de um plantão |
| `POST` | `/plantoes` | Cria plantão |
| `PATCH` | `/plantoes/:id` | Edita plantão |
| `POST` | `/plantoes/:id/usuarios` | Adiciona médicos à equipe/fila |
| `DELETE` | `/plantoes/:id/usuarios/:usuarioId` | Remove médico |
| `PATCH` | `/plantoes/:id/coordenador` | Define o coordenador |
| `GET` | `/plantoes/:id/trocas` | Histórico de trocas do plantão |
| `POST` | `/plantoes/:id/trocas` | Solicita troca de médico |
| `GET` | `/plantoes/trocas/pendentes` | Trocas aguardando o aceite do usuário logado |
| `PATCH` | `/plantoes/trocas/:trocaId/aceitar` | Aceita a troca |
| `PATCH` | `/plantoes/trocas/:trocaId/recusar` | Recusa a troca |

**Dashboard**

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/dashboard` | Próximo plantão, agenda de 7 dias, trocas pendentes e resumo do mês do usuário logado |
| `GET` | `/dashboard/gestao` | Visão do hospital (`admin`, `tecnico`): plantões em andamento, alertas de cobertura, trocas pendentes, resumo/top 5 do mês e equipe |

**BM Financeiro**

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/bm-financeiro?mes=AAAA-MM` | Horas por plantonista e pontos por sócio no mês |

---

## 👤 Exemplo — Cadastro

**POST** `/auth/register`

```json
{
  "email": "fulano@hospital.com",
  "password": "senha123",
  "nome": "Dr. Fulano",
  "sigla": "FU",
  "roles": ["anestesita_plantonista"],
  "crm": "123456",
  "crm_uf": "SP"
}
```

> `crm` e `crm_uf` são obrigatórios só para anestesistas.

## 🔑 Exemplo — Login

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
