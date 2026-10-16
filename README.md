# 🏥 Plantão — GAMI

Sistema de gestão de plantões hospitalares do **GAMI (Grupo Anestesia Materno Infantil)**: escala de plantões, trocas entre médicos, férias e congressos, gestão de usuários e o BM Financeiro mensal.

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
│   │   │   ├── authController.js   # Login, cadastro, /me (ver e editar o próprio perfil) e redefinição de senha
│   │   │   ├── users.js            # Busca de médicos e gestão de usuários
│   │   │   ├── plantoes.js         # Plantões, equipes/filas e trocas
│   │   │   ├── afastamentos.js     # Férias e congressos dos médicos
│   │   │   ├── dashboard.js        # Painel pessoal e visão da gestão
│   │   │   └── bmFinanceiro.js     # Resumo mensal de horas e pontos
│   │   ├── services/
│   │   │   ├── usuarios.js         # Validação de sigla, roles e CRM
│   │   │   └── afastamentos.js     # Consulta de férias/congressos por data
│   │   ├── middleware/
│   │   │   └── auth.js             # Validação do JWT e checagem de roles
│   │   ├── routes/                 # auth, users, plantoes, afastamentos, dashboard, bmFinanceiro
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
│   │       ├── perfil/             # Meu perfil (dados, dias disponíveis, férias e congressos)
│   │       ├── usuarios/           # Gestão de usuários
│   │       └── bm-financeiro/      # BM Financeiro
│   ├── components/                 # Modais, calendário, grid de participantes, sidebar, badges
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

Para testar localmente, use o **Supabase local** (Postgres, Auth e Storage no Docker), com dados de teste. Precisa da [Supabase CLI](https://supabase.com/docs/guides/local-development) (`brew install supabase/tap/supabase`).

```bash
supabase start              # na raiz do repositório; sobe o Supabase local
cd Backend && npm run db:reset   # zera o banco local, aplica as migrations e cria os dados de teste
```

- `Backend/.env` aponta para o Supabase local (`http://host.docker.internal:54321`, porque o backend roda no Docker). A chave `service_role` local aparece no `supabase status`.
- A produção fica em `Backend/.env.producao` (fora do git). Para subir o backend contra ela: `ENV_FILE=.env.producao docker-compose up`.
- Os usuários de teste têm a senha `senha123`: `escritorio@example.com` (escritório + admin), `paula@example.com` (técnico), `ana@example.com` (sócia), `igor@example.com` (plantonista) etc. A lista completa sai no fim do `npm run db:reset`.
- Studio (painel do banco): `http://127.0.0.1:54323`. E-mails (redefinição de senha): `http://127.0.0.1:54324`.
- Para as fotos das fichas abrirem no navegador, o Mac precisa conhecer o nome `host.docker.internal`: `echo "127.0.0.1 host.docker.internal" | sudo tee -a /etc/hosts`.

O schema fica em `supabase/migrations/`. A **produção não aplica migrations sozinha**: cada mudança de schema vira um arquivo novo em `supabase/migrations/` e também é rodada manualmente no **SQL Editor** do Supabase de produção.

- `profiles.dias_disponiveis` (`smallint[]`, 0 = domingo … 6 = sábado): dias da semana em que o médico prefere trabalhar. `null` = todos os dias.
- `afastamentos`: períodos de férias ou congresso de cada médico (`tipo`, `data_inicio`, `data_fim`, `observacao`).

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
| `anestesita_socio` | Anestesista sócio — entra em qualquer vaga do plantão; no BM conta **pontos** pela vaga |
| `anestesita_plantonista` | Anestesista plantonista — entra em qualquer vaga do plantão; no BM conta **horas** (se também for sócio, conta pontos) |
| `tecnico` | Técnico — gestão de usuários (inclusive de administradores, exceto a role admin) |
| `admin` | Administrador |

- As roles ficam em `app_metadata` no Supabase — só a service role key consegue alterá-las.
- Anestesistas precisam informar **CRM** (até 7 dígitos) + **UF** no cadastro.
- Todo usuário tem uma **sigla** única de 2 letras, exibida nos badges do calendário.

---

## 📅 Funcionalidades

### Plantões
Segue a escala anual do cliente: **um plantão por dia**, sem tipo, com as vagas do diurno e do noturno. A vaga (posição de 1 a 13, na ordem das linhas da escala) é o que identifica cada lugar:

| Turno | Horário | Vagas (posição) |
|-------|---------|-----------------|
| Diurno | 7h–19h | Coordenador (1), Coordenador (2), 2º a 7º (3 a 8) |
| Noturno | 19h–7h do dia seguinte | Intermediário (9), 1º (10), 1º (11), 2º (12), 3º (13) |

Regras de escala:
- Qualquer médico (sócio ou plantonista) entra em qualquer vaga. O coordenador **não é obrigatório** (o plantão precisa de pelo menos um médico); o dashboard da gestão avisa quando o diurno está sem coordenador.
- O mesmo médico pode estar no **diurno e no noturno** do mesmo dia (os turnos só se encostam às 19h), mas não em duas vagas do mesmo turno.
- Um médico não pode estar em duas vagas com horários sobrepostos (inclusive a troca por horas).
- Médico de **férias ou em congresso** não pode ser escalado nesses dias (veja abaixo).
- O horário é fixo por turno; quem cobre só parte de uma vaga usa a troca por horas.

Os participantes aparecem em dois **grids**, um por turno, com uma célula por vaga (clique numa vaga vazia para preenchê-la). As vagas de coordenador ficam em destaque, e quem vira coordenador é definido mudando o médico de vaga — inclusive entre o diurno e o noturno. As ações de cada médico (trocar, remover) ficam num menu ao clicar na célula. Mudar posições: a gestão e os médicos escalados no plantão.

O calendário tem visões de **semana** (uma linha por turno) e **mês**, com uma **cor por turno** (âmbar = diurno, índigo = noturno). No celular, a semana mostra os dias empilhados. A tela **Meu plantão** mostra a semana no formato da escala: as vagas nas linhas e os dias nas colunas.

### Trocas de plantão
Substituir o médico de uma vaga já ocupada cria uma **solicitação de troca** (a troca é da vaga). A troca só vale depois que o médico que entra **aceita**, e enquanto isso o médico que sai continua no plantão. Adicionar alguém num slot vazio não precisa de aceite. O sino de notificações mostra as trocas pendentes para o usuário logado.

### Meu perfil
Acessado pelo menu da sigla (canto superior). Cada usuário vê seus dados e edita nome, sigla, telefone, data de nascimento e CRM. E-mail e funções só a gestão altera. Anestesistas também têm:
- **Dias disponíveis** — dias da semana em que preferem trabalhar. Quem monta o plantão ainda pode escalá-lo em outro dia, mas a busca mostra um aviso.
- **Férias e congressos** — períodos (data inicial a final) em que o médico **não pode ser escalado**: na busca ele aparece desabilitado, com o motivo. Se já estiver escalado, o plantão ganha um indicador vermelho no calendário e no grid, para a gestão resolver.

Plantões que viram a noite contam pelo dia em que começam.

### Gestão de usuários
Tela para listar, criar e editar usuários, ativar/desativar contas e enviar e-mail de redefinição de senha. A lista mostra o contato (e-mail e telefone) de cada usuário, e o modal do médico mostra suas férias e congressos (só leitura).
- **Visualizar:** `admin`, `anestesita_socio`, `tecnico`
- **Editar:** `admin`, `tecnico` (o técnico edita administradores, mas não concede nem remove a role admin)

### Dashboard
Painel pessoal de cada usuário: próximo plantão (com contagem regressiva e papel na equipe/fila), agenda dos próximos 7 dias, trocas aguardando o seu aceite (com Aceitar/Recusar), trocas que você pediu e o resumo do seu mês em horas/pontos. Os dados vêm de um único endpoint e mostram só o que é do próprio usuário.

Para `admin` e `tecnico`, o dashboard também mostra a **visão da gestão**: quem está de plantão agora, alertas de cobertura dos próximos 7 dias por turno (turno sem médico ou diurno sem coordenador), trocas pendentes no sistema, resumo do mês comparado ao anterior, top 5 em horas e pontos e a equipe cadastrada por role.

### BM Financeiro
Resumo mensal por médico, calculado na hora a partir dos plantões (nada é gravado). O plantão não tem tipo: a separação é pelo **cargo** do médico.
- **Plantonista** (só o cargo de plantonista) — soma das **horas trabalhadas**. O noturno conta inteiro no mês em que o plantão começa.
- **Sócio** (tem o cargo de sócio, mesmo que também seja plantonista) — soma de **pontos pela vaga**: diurno Coordenador 7, Coordenador 7, 2º 6 … 7º 1; noturno 1º 7, 1º 7, 2º 6, 3º 5, intermediário 7.

Tem seletor de mês, busca por médico e **exportação para Excel** (uma aba para plantonistas e outra para sócios). Acesso: `admin`, `anestesita_socio` e `tecnico`.

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
| `GET` | `/auth/me` | Dados do usuário logado (`id`, `email`, `nome`, `sigla`, `roles`, CRM, telefone, data de nascimento, dias disponíveis) |
| `PATCH` | `/auth/me` | Edita o próprio cadastro (nome, sigla, telefone, data de nascimento, CRM, dias disponíveis) |
| `POST` | `/auth/me/senha` | Troca a própria senha (`senha_atual` + `nova_senha`, mínimo 8). Encerra as sessões da conta e devolve uma nova (`token`, `refresh_token`, `expires_at`) |

**Usuários**

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/users` | Busca de médicos (`?search=`, `?role=`). Com `?data=` marca quem está de férias/congresso; com `?horaInicio=&horaFim=` também tira quem tem conflito de horário |
| `GET` | `/users/gestao` | Lista para a gestão de usuários |
| `POST` | `/users` | Cria usuário |
| `PATCH` | `/users/:id` | Edita nome, sigla, roles e CRM |
| `PATCH` | `/users/:id/ativo` | Ativa/desativa usuário |
| `POST` | `/users/:id/reset-senha` | Envia e-mail de redefinição de senha |

**Plantões**

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/plantoes` | Lista plantões (`?inicio=`, `?fim=`) |
| `GET` | `/plantoes/:id` | Detalhe de um plantão |
| `POST` | `/plantoes` | Cria o plantão do dia (`titulo`, `data`, `fila: [{ usuario_id, posicao }]`); 409 se o dia já tem plantão |
| `PATCH` | `/plantoes/:id` | Edita título, descrição e dia |
| `POST` | `/plantoes/:id/usuarios` | Preenche vagas vazias (`fila: [{ usuario_id, posicao }]`) |
| `DELETE` | `/plantoes/:id/vagas/:posicao` | Esvazia a vaga (registra no histórico e cancela a troca pendente dela) |
| `GET` | `/plantoes/:id/remocoes` | Histórico de remoções do plantão |
| `PATCH` | `/plantoes/:id/posicao` | Move o médico da vaga `posicao` para `nova_posicao` (troca com quem estiver nela); define o coordenador |
| `GET` | `/plantoes/:id/trocas` | Histórico de trocas do plantão |
| `POST` | `/plantoes/:id/trocas` | Solicita troca da vaga (`posicao`, `usuario_entrada` e, na troca por horas, `hora_inicio`/`hora_fim`) |
| `GET` | `/plantoes/trocas/pendentes` | Trocas aguardando o aceite do usuário logado |
| `PATCH` | `/plantoes/trocas/:trocaId/aceitar` | Aceita a troca |
| `PATCH` | `/plantoes/trocas/:trocaId/recusar` | Recusa a troca |

**Férias e congressos**

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/afastamentos/me` | Períodos atuais e futuros do usuário logado |
| `POST` | `/afastamentos` | Cadastra férias ou congresso (só anestesistas) — retorna os plantões já escalados no período |
| `DELETE` | `/afastamentos/:id` | Remove um período próprio |
| `GET` | `/afastamentos/usuario/:usuarioId` | Períodos atuais e futuros de um médico (`admin`, `tecnico`) |

**Dashboard**

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/dashboard` | Próximo plantão, agenda de 7 dias, trocas pendentes e resumo do mês do usuário logado |
| `GET` | `/dashboard/gestao` | Visão do hospital (`admin`, `tecnico`): plantões em andamento, alertas de cobertura, trocas pendentes, resumo/top 5 do mês e equipe |

**BM Financeiro**

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/bm-financeiro?mes=AAAA-MM` | Horas por plantonista e pontos por sócio no mês (pelo cargo do médico) |

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
