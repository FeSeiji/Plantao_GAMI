# 🏥 Plantão — GAMI

Sistema de gestão de plantões hospitalares do **GAMI (Grupo Anestesia Materno Infantil)**: escala de plantões, trocas entre médicos, férias e congressos, fichas anestésicas, casos fora, gestão de usuários e o BM Financeiro mensal.

O projeto é dividido em duas aplicações:

- **Backend** — API REST em **Node.js** + **Express** + **Supabase**
- **Frontend** — aplicação web em **Next.js** + **Tailwind CSS**

---

## 🚀 Tecnologias

**Backend**
- **Node.js** v18+ (o `@supabase/supabase-js` recomenda v20+)
- **Express** v5
- **Supabase** — autenticação (Auth), banco de dados (Postgres) e arquivos (Storage, para as fotos das fichas)
- **Docker** + **Docker Compose**
- **Nodemon** — hot reload em desenvolvimento

**Frontend**
- **Next.js** 15 (App Router) + **React** 19
- **TypeScript**
- **Tailwind CSS** 3
- **ExcelJS** — exportação do BM Financeiro para `.xlsx`

**Deploy:** backend no **Render**, frontend na **Vercel**, banco no **Supabase**.

---

## 📁 Estrutura do Projeto

```
Plantão/
├── Backend/
│   ├── src/
│   │   ├── controllers/
│   │   │   ├── authController.js   # Login, refresh, cadastro, /me (perfil e troca de senha) e redefinição de senha
│   │   │   ├── users.js            # Busca de médicos e gestão de usuários (inclui a aprovação de cadastros)
│   │   │   ├── plantoes.js         # Plantões, vagas, trocas e histórico
│   │   │   ├── afastamentos.js     # Férias e congressos (pedido do médico, aprovação da gestão)
│   │   │   ├── fichas.js           # Fichas anestésicas (com foto)
│   │   │   ├── casosFora.js        # Casos fora da escala
│   │   │   ├── hospitais.js        # Hospitais dos casos fora
│   │   │   ├── dashboard.js        # Painel pessoal e visão da gestão
│   │   │   └── bmFinanceiro.js     # Resumo mensal de horas e pontos
│   │   ├── services/               # Regras compartilhadas: vagas, conflitos de horário, trocas por horas, afastamentos, usuários
│   │   ├── middleware/
│   │   │   ├── auth.js             # Validação do JWT e checagem de roles
│   │   │   └── rateLimit.js        # Limites de login, cadastro e e-mails
│   │   ├── routes/
│   │   ├── app.js                  # Configuração do Express
│   │   └── server.js               # Entrypoint — sobe o servidor
│   ├── scripts/
│   │   └── seed-local.js           # Dados de teste do Supabase local
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
│   │       ├── meu-plantao/        # Semana no formato da escala
│   │       ├── fichas/             # Fichas anestésicas
│   │       ├── casos-fora/         # Casos fora
│   │       ├── perfil/             # Meu perfil (dados, senha, dias disponíveis, férias e congressos)
│   │       ├── usuarios/           # Gestão de usuários
│   │       └── bm-financeiro/      # BM Financeiro
│   ├── components/                 # Modais, calendário, lista de participantes, sidebar, badges
│   ├── public/                     # Logos da GAMI
│   ├── .env.example
│   └── package.json
├── supabase/
│   ├── config.toml                 # Supabase local
│   └── migrations/                 # Schema do banco
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

Sem Docker, use `SUPABASE_URL=http://127.0.0.1:54321` no `.env` para o Supabase local.

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
| `tecnico` | Técnico — faz parte da gestão |
| `escritorio` | Escritório — faz parte da gestão |

- **Administrador** não é role: é a flag `is_admin`, que dá acesso de gestão e só pode ser concedida ou retirada por outro administrador.
- **Gestão** = `escritorio`, `tecnico` e administradores. É quem monta a escala, aprova cadastros e afastamentos e edita registros de outras pessoas.
- As roles e a flag admin ficam em `app_metadata` no Supabase — só a service role key consegue alterá-las.
- Anestesistas precisam informar **CRM** (até 7 dígitos) + **UF** no cadastro.
- Todo usuário tem uma **sigla** única de 2 letras, exibida nos badges do calendário.

---

## 📅 Funcionalidades

### Cadastro e acesso
- **Cadastro público** (`/register`): qualquer cargo (sócio, plantonista, técnico ou escritório). A conta nasce **bloqueada** e só entra depois que a gestão aprova na tela de Usuários.
- **Login** com sessão renovada automaticamente (refresh token), sem pedir a senha de novo.
- **Esqueci a senha** por e-mail, e **troca da própria senha** no perfil.
- Login, cadastro e e-mails têm limite de tentativas.

### Plantões
Segue a escala anual do cliente: **um plantão por dia**, com as vagas do diurno e do noturno. A vaga (posição de 1 a 13, na ordem das linhas da escala) identifica cada lugar:

| Turno | Horário | Vagas (posição) |
|-------|---------|-----------------|
| Diurno | 7h–19h | Coordenador (1), Coordenador (2), 2º a 7º (3 a 8) |
| Noturno | 19h–7h do dia seguinte | Intermediário (9), 1º (10), 1º (11), 2º (12), 3º (13) |

Regras de escala:
- Qualquer médico (sócio ou plantonista) entra em qualquer vaga. O coordenador **não é obrigatório** (o plantão precisa de pelo menos um médico); o dashboard da gestão avisa quando o diurno está sem coordenador.
- O mesmo médico pode estar no **diurno e no noturno** do mesmo dia (os turnos só se encostam às 19h), mas não em duas vagas do mesmo turno.
- Um médico não pode estar em duas vagas com horários sobrepostos (inclusive a troca por horas).
- Médico com **férias ou congresso aprovados** não pode ser escalado nesses dias (veja abaixo).
- Só a gestão cria e edita plantões e preenche ou esvazia vagas. Médicos podem **pedir uma vaga livre** (veja abaixo).

No modal do plantão, os participantes aparecem em **lista**, uma por turno, com uma linha por vaga: a vaga ("Coord.", "2º", "Interm."), a sigla, o nome e, embaixo, avisos como troca pendente, troca por horas ou férias. As ações de cada médico (trocar, remover) ficam no botão **⋯**, e uma vaga livre mostra **+ Adicionar**. Quem vira coordenador é definido mudando o médico de vaga — inclusive entre o diurno e o noturno. Mudar posições: a gestão e os médicos escalados no plantão. O modal também mostra o histórico de trocas, remoções e mudanças de vaga.

O calendário tem visões de **semana** (uma linha por turno) e **mês**, com uma **cor por turno** (âmbar = diurno, índigo = noturno). Cada sigla tem indicadores: anel roxo do coordenador, ponto laranja de troca pendente, "!" de afastamento aprovado, "?" de pedido pendente e a sigla de quem cobre a troca por horas. No celular, a semana mostra os dias empilhados.

### Pedido de vaga livre
No modal do plantão, o médico (sócio ou plantonista) vê **Pedir esta vaga** nas vagas livres, até o turno começar e se ainda não estiver naquele turno. O pedido fica pendente até a **gestão aprovar ou recusar**, pelo sino de notificações ou na própria vaga no modal.
- Vários médicos podem pedir a mesma vaga; ao aprovar um, os outros pedidos dela são recusados.
- Ao aprovar, o médico entra na vaga, e os outros pedidos dele no mesmo turno do plantão são cancelados.
- As regras de escala (uma vaga por turno, sem conflito de horário, sem férias aprovadas) são checadas no pedido e de novo na aprovação.
- Se a gestão preencher a vaga antes de responder, os pedidos dela são cancelados. O médico pode cancelar o próprio pedido.
- Pedidos e respostas aparecem no histórico do plantão.

### Meu plantão
A semana no formato da escala: as vagas nas linhas e os dias nas colunas, com as suas vagas destacadas. Clicar em qualquer célula de um dia abre o plantão. Para sócios, plantonistas, técnicos e escritório.

### Trocas de plantão
- **Troca da vaga inteira:** substituir o médico de uma vaga cria uma **solicitação de troca**. Ela só vale depois do aceite: de quem entra ou, quando o substituto pede a vaga para si, de quem sai. Enquanto isso, o titular continua no plantão.
- **Troca por horas:** o substituto cobre só parte da vaga (do início até um horário, ou de um horário até o fim). A vaga continua do titular, e as horas e pontos são divididos no BM.
- Quem pediu (ou a gestão) pode cancelar um pedido pendente. A gestão também pode desfazer uma troca por horas já aceita.
- O sino de notificações mostra as trocas aguardando o aceite do usuário logado.

### Meu perfil
Acessado pelo menu da sigla (canto superior). Cada usuário edita nome, sigla, telefone, data de nascimento e CRM, e troca a própria senha. E-mail e funções só a gestão altera. Anestesistas também têm:
- **Dias disponíveis** — dias da semana em que preferem trabalhar. Quem monta o plantão ainda pode escalá-lo em outro dia, mas a busca mostra um aviso.
- **Férias e congressos** — o médico pede o período (data inicial a final) e a **gestão aprova ou recusa**. Aprovado, ele não pode ser escalado nesses dias: na busca aparece desabilitado, com o motivo. Se já estiver escalado, o plantão ganha um indicador vermelho no calendário e no modal, para a gestão resolver.

Plantões que viram a noite contam pelo dia em que começam.

### Fichas anestésicas
Registro avulso de uma anestesia, sem ligação com o plantão: data, horário, anestesista, tipo de anestesia, observações e **uma foto** da ficha (guardada num bucket privado do Supabase Storage; o link da foto vale 1 hora). Todos os usuários logados veem; criam médicos e a gestão; editam e excluem quem criou ou a gestão.

### Casos fora
Cirurgias feitas por um anestesista fora da escala (substitui o antigo Google Forms): data, anestesista, se estava escalado, cirurgião, paciente (nome e CPF), cirurgia, hospital, recibo (GAMI, PMP, sem recibo ou pessoal), valor e comentários. Todos os usuários logados veem; editam e excluem quem criou ou a gestão. A lista de **hospitais** é cadastrada pela gestão (hospital desativado some das opções, mas continua nos casos antigos). Os casos do mês também aparecem numa aba do BM Financeiro.

### Gestão de usuários
Tela para listar, criar e editar usuários, **aprovar cadastros pendentes**, ativar/desativar contas e enviar e-mail de redefinição de senha. A lista mostra o contato (e-mail e telefone) de cada usuário, e o modal do médico mostra suas férias e congressos (a gestão pode remover).
- **Visualizar:** gestão e `anestesita_socio`
- **Editar:** gestão (só administradores concedem ou retiram a flag admin)

### Dashboard
Painel pessoal de cada usuário: próximo plantão (com contagem regressiva e a vaga), agenda dos próximos 7 dias, trocas aguardando o seu aceite (com Aceitar/Recusar), trocas que você pediu e o resumo do seu mês em horas/pontos.

Para a gestão, o dashboard também mostra a **visão do hospital**: quem está de plantão agora, alertas de cobertura dos próximos 7 dias por turno (turno sem médico ou diurno sem coordenador), trocas pendentes no sistema, resumo do mês comparado ao anterior, top 5 em horas e pontos e a equipe cadastrada por role.

### BM Financeiro
Resumo mensal por médico, calculado na hora a partir dos plantões (nada é gravado). O plantão não tem tipo: a separação é pelo **cargo** do médico.
- **Plantonista** (só o cargo de plantonista) — soma das **horas trabalhadas**. O noturno conta inteiro no mês em que o plantão começa.
- **Sócio** (tem o cargo de sócio, mesmo que também seja plantonista) — soma de **pontos pela vaga**: diurno Coordenador 7, Coordenador 7, 2º 6 … 7º 1; noturno intermediário 7, 1º 7, 1º 7, 2º 6, 3º 5.
- **Troca por horas:** as horas e os pontos da vaga são divididos na proporção das horas de cada um.

Tem seletor de mês, busca por médico, aba de **casos fora** e **exportação para Excel**. Acesso: gestão e `anestesita_socio`.

---

## 📡 Endpoints

A API usa **JWT via Supabase Auth**. Após o login, inclua o token nas requisições protegidas:

```
Authorization: Bearer <access_token>
```

"Gestão" nas tabelas abaixo = `escritorio`, `tecnico` ou administrador.

### Públicos

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/health` | Status da API e do banco (usado pelo monitor que mantém o Render acordado) |
| `POST` | `/auth/login` | Login — retorna `{ token, refresh_token, expires_at }` |
| `POST` | `/auth/refresh` | Renova a sessão (`refresh_token`) |
| `POST` | `/auth/register` | Cadastro público — a conta fica pendente até a gestão aprovar |
| `POST` | `/auth/forgot-password` | Envia e-mail de redefinição de senha |
| `POST` | `/auth/reset-password` | Define a nova senha (`access_token` + `password`) |

### Protegidos

**Autenticação**

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/auth/me` | Dados do usuário logado (`id`, `email`, `nome`, `sigla`, `roles`, `is_admin`, CRM, telefone, data de nascimento, dias disponíveis) |
| `PATCH` | `/auth/me` | Edita o próprio cadastro (nome, sigla, telefone, data de nascimento, CRM, dias disponíveis) |
| `POST` | `/auth/me/senha` | Troca a própria senha (`senha_atual` + `nova_senha`, mínimo 8). Encerra as sessões da conta e devolve uma nova (`token`, `refresh_token`, `expires_at`) |

**Usuários**

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/users` | Busca de médicos (`?search=`, `?role=`). Com `?data=` marca quem está de férias/congresso; com `?horaInicio=&horaFim=` também tira quem tem conflito de horário |
| `GET` | `/users/gestao` | Lista para a gestão de usuários (gestão e sócios) |
| `POST` | `/users` | Cria usuário (gestão) |
| `PATCH` | `/users/:id` | Edita nome, sigla, roles, flag admin e CRM (gestão) |
| `PATCH` | `/users/:id/ativo` | Ativa/desativa usuário — também aprova cadastros pendentes (gestão) |
| `POST` | `/users/:id/reset-senha` | Envia e-mail de redefinição de senha (gestão) |

**Plantões**

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/plantoes` | Lista plantões (`?inicio=`, `?fim=`) |
| `GET` | `/plantoes/:id` | Detalhe de um plantão |
| `POST` | `/plantoes` | Cria o plantão do dia (`titulo`, `data`, `fila: [{ usuario_id, posicao }]`); 409 se o dia já tem plantão (gestão) |
| `PATCH` | `/plantoes/:id` | Edita título, descrição e dia (gestão) |
| `POST` | `/plantoes/:id/usuarios` | Preenche vagas vazias (`fila: [{ usuario_id, posicao }]`) (gestão) |
| `DELETE` | `/plantoes/:id/vagas/:posicao` | Esvazia a vaga (registra no histórico e cancela a troca pendente dela) (gestão) |
| `PATCH` | `/plantoes/:id/posicao` | Move o médico da vaga `posicao` para `nova_posicao` (troca com quem estiver nela); define o coordenador (gestão e médicos) |
| `GET` | `/plantoes/:id/remocoes` | Histórico de remoções do plantão |
| `GET` | `/plantoes/:id/mudancas-posicao` | Histórico de mudanças de vaga |
| `GET` | `/plantoes/:id/trocas` | Histórico de trocas do plantão |
| `POST` | `/plantoes/:id/trocas` | Solicita troca da vaga (`posicao`, `usuario_entrada` e, na troca por horas, `hora_inicio`/`hora_fim`) |
| `PATCH` | `/plantoes/:id/trocas/:trocaId/cancelar` | Cancela um pedido pendente (quem pediu ou a gestão) ou desfaz uma troca por horas aceita (gestão) |
| `GET` | `/plantoes/:id/pedidos-vaga` | Pedidos de vaga livre do plantão (todos os status) |
| `POST` | `/plantoes/:id/pedidos-vaga` | Pede uma vaga livre (`posicao`) (médicos) |
| `GET` | `/plantoes/pedidos-vaga/pendentes` | Pedidos de vaga aguardando aprovação, de todos os plantões (gestão) |
| `PATCH` | `/plantoes/pedidos-vaga/:pedidoId/aprovar` | Aprova: o médico entra na vaga e os outros pedidos dela são recusados (gestão) |
| `PATCH` | `/plantoes/pedidos-vaga/:pedidoId/recusar` | Recusa o pedido (gestão) |
| `PATCH` | `/plantoes/pedidos-vaga/:pedidoId/cancelar` | Cancela um pedido pendente (quem pediu ou a gestão) |
| `GET` | `/plantoes/trocas/pendentes` | Trocas aguardando o aceite do usuário logado |
| `PATCH` | `/plantoes/trocas/:trocaId/aceitar` | Aceita a troca |
| `PATCH` | `/plantoes/trocas/:trocaId/recusar` | Recusa a troca |

**Férias e congressos**

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/afastamentos/me` | Períodos atuais e futuros do usuário logado (inclui os recusados) |
| `POST` | `/afastamentos` | Pede férias ou congresso (só anestesistas) — fica pendente até a gestão aprovar |
| `DELETE` | `/afastamentos/:id` | Remove um período (o próprio médico, enquanto não for aprovado; a gestão, qualquer um) |
| `GET` | `/afastamentos/pendentes` | Pedidos aguardando aprovação (gestão) |
| `GET` | `/afastamentos/usuario/:usuarioId` | Períodos atuais e futuros de um médico (gestão) |
| `PATCH` | `/afastamentos/:id/aprovar` | Aprova o pedido (gestão) |
| `PATCH` | `/afastamentos/:id/recusar` | Recusa o pedido (gestão) |

**Fichas anestésicas**

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/fichas` | Lista as fichas |
| `GET` | `/fichas/:id` | Detalhe, com o link temporário da foto |
| `POST` | `/fichas` | Cria a ficha (foto em `fotos_novas`, como data URL) (médicos e gestão) |
| `PATCH` | `/fichas/:id` | Edita (quem criou ou a gestão) |
| `DELETE` | `/fichas/:id` | Exclui, com a foto (quem criou ou a gestão) |

**Casos fora e hospitais**

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/casos-fora` | Lista os casos fora |
| `POST` | `/casos-fora` | Registra um caso (médicos e gestão) |
| `PATCH` | `/casos-fora/:id` | Edita (quem criou ou a gestão) |
| `DELETE` | `/casos-fora/:id` | Exclui (quem criou ou a gestão) |
| `GET` | `/hospitais` | Lista os hospitais |
| `POST` | `/hospitais` | Cadastra um hospital (gestão) |
| `PATCH` | `/hospitais/:id` | Renomeia ou ativa/desativa (gestão) |

**Dashboard**

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/dashboard` | Próximo plantão, agenda de 7 dias, trocas pendentes e resumo do mês do usuário logado |
| `GET` | `/dashboard/gestao` | Visão do hospital (gestão): plantões em andamento, alertas de cobertura, trocas pendentes, resumo/top 5 do mês e equipe |

**BM Financeiro**

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/bm-financeiro?mes=AAAA-MM` | Horas por plantonista, pontos por sócio e os casos fora do mês (gestão e sócios) |

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

> `crm` e `crm_uf` são obrigatórios só para anestesistas. A conta fica pendente até a gestão aprovar.

**Resposta:**

```json
{
  "id": "…",
  "pendente": true
}
```

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
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "…",
  "expires_at": 1760000000
}
```
