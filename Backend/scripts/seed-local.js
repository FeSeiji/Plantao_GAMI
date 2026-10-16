// Dados de teste para o Supabase LOCAL: usuários de todos os cargos, plantões do mês passado ao mês que vem,
// trocas, troca por horas, afastamentos, hospitais, casos fora e fichas.
// Uso (no host, com o Supabase local rodando): npm run db:reset — zera o banco e roda este script.
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

// O .env aponta para host.docker.internal (o backend roda no Docker); aqui o script roda no host
process.env.SUPABASE_URL = (process.env.SUPABASE_URL ?? '').replace('host.docker.internal', '127.0.0.1')

const { hostname } = new URL(process.env.SUPABASE_URL)
if (!['127.0.0.1', 'localhost'].includes(hostname)) {
  console.error(`SUPABASE_URL aponta para ${hostname}. Este script só roda no Supabase local.`)
  process.exit(1)
}

const { createClient } = require('@supabase/supabase-js')
const { criarUsuario } = require('../src/services/usuarios')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const SENHA = 'senha123'

const SOCIOS = [
  ['Ana Souza', 'AS'], ['Bruno Lima', 'BL'], ['Carla Mendes', 'CM'], ['Daniel Rocha', 'DR'],
  ['Eduarda Alves', 'EA'], ['Fábio Nunes', 'FN'], ['Gabriela Costa', 'GC'], ['Henrique Dias', 'HD'],
]
const PLANTONISTAS = [
  ['Igor Ramos', 'IR'], ['Juliana Pires', 'JP'], ['Lucas Teixeira', 'LT'],
  ['Marina Lopes', 'ML'], ['Nicolas Barros', 'NB'], ['Otávio Freitas', 'OF'],
]

const emailDe = nome => `${nome.split(' ')[0].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()}@example.com`

function dataLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function diaRelativo(dias) {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  return dataLocal(d)
}

// CPF com os dígitos verificadores certos (o backend valida)
function cpfValido(base9) {
  const digitos = base9.split('').map(Number)
  for (const tamanho of [9, 10]) {
    const soma = digitos.slice(0, tamanho).reduce((s, n, i) => s + n * (tamanho + 1 - i), 0)
    const resto = (soma * 10) % 11
    digitos.push(resto === 10 ? 0 : resto)
  }
  return digitos.join('')
}

async function ok(promessa, oQue) {
  const { data, error } = await promessa
  if (error) throw new Error(`${oQue}: ${error.message}`)
  return data
}

async function criar(dados, opcoes) {
  const { user, error } = await criarUsuario({ password: SENHA, ...dados }, opcoes)
  if (error) throw new Error(`usuário ${dados.email}: ${error}`)
  return user.id
}

async function main() {
  const { data: existentes } = await supabase.auth.admin.listUsers({ perPage: 1 })
  if (existentes?.users?.length > 0) {
    console.error('O banco local já tem usuários. Rode npm run db:reset para zerar e popular de novo.')
    process.exit(1)
  }

  // Usuários
  const escritorio = await criar({ email: 'escritorio@example.com', nome: 'Escritório Teste', sigla: 'ES', roles: ['escritorio'], is_admin: true })
  const tecnico = await criar({ email: 'paula@example.com', nome: 'Paula Martins', sigla: 'PM', roles: ['tecnico'] })

  let crm = 100001
  const medicos = []
  for (const [nome, sigla] of SOCIOS) {
    medicos.push({ nome, id: await criar({ email: emailDe(nome), nome, sigla, roles: ['anestesita_socio'], crm: String(crm++), crm_uf: 'SP' }) })
  }
  for (const [nome, sigla] of PLANTONISTAS) {
    medicos.push({ nome, id: await criar({ email: emailDe(nome), nome, sigla, roles: ['anestesita_plantonista'], crm: String(crm++), crm_uf: 'SP' }) })
  }

  // Cadastro público aguardando a aprovação da gestão
  await criar(
    { email: 'rafael@example.com', nome: 'Rafael Gomes', sigla: 'RG', roles: ['anestesita_plantonista'], crm: String(crm++), crm_uf: 'SP' },
    { pendente: true }
  )

  const [ana, bruno, carla, daniel] = medicos
  const [igor, juliana] = medicos.slice(SOCIOS.length)

  await ok(supabase.from('profiles').update({ telefone: '11987654321', data_nascimento: '1985-03-12' }).eq('id', ana.id), 'perfil')
  await ok(supabase.from('profiles').update({ dias_disponiveis: [1, 3, 5] }).eq('id', igor.id), 'perfil')

  // Plantões: um por dia, do 1º dia do mês passado ao último do mês que vem.
  // A fila gira 5 médicos por dia; 8 no diurno (vagas 1–8), 5 no noturno (9–13) e 1 de folga.
  // Fim de semana com o diurno menor (vagas 7 e 8 vazias); dois dias sem plantão no mês que vem.
  const hoje = new Date()
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)
  const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 2, 0)
  const semPlantao = new Set([
    dataLocal(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 10)),
    dataLocal(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 11)),
  ])

  const escala = new Map() // data -> { plantaoId, vagas: Map(posicao -> medico), folga }
  for (let d = new Date(inicio), i = 0; d <= fim; d.setDate(d.getDate() + 1), i++) {
    const data = dataLocal(d)
    if (semPlantao.has(data)) continue

    const ordem = medicos.map((_, k) => medicos[(k + i * 5) % medicos.length])
    const fimDeSemana = d.getDay() === 0 || d.getDay() === 6
    const vagas = new Map()
    ordem.slice(0, 8).forEach((m, k) => {
      if (!(fimDeSemana && k >= 6)) vagas.set(k + 1, m)
    })
    ordem.slice(8, 13).forEach((m, k) => vagas.set(k + 9, m))
    escala.set(data, { vagas, folga: ordem[13] })
  }

  const plantoes = await ok(
    supabase.from('plantoes').insert([...escala.keys()].map(data => ({ titulo: 'Plantão', data, criado_por: escritorio }))).select('id, data'),
    'plantões'
  )
  for (const p of plantoes) escala.get(p.data).plantaoId = p.id

  await ok(
    supabase.from('plantao_usuarios').insert(
      [...escala.values()].flatMap(({ plantaoId, vagas }) =>
        [...vagas].map(([posicao, m]) => ({ plantao_id: plantaoId, usuario_id: m.id, posicao }))
      )
    ),
    'vagas'
  )

  // Trocas, sempre em dias com plantão
  const diaComPlantao = desde => {
    for (let k = desde; ; k++) if (escala.has(diaRelativo(k))) return escala.get(diaRelativo(k))
  }

  // Pedido pendente da vaga inteira: o titular da vaga 3 pede para quem está de folga
  const dia3 = diaComPlantao(3)
  await ok(supabase.from('plantao_trocas').insert({
    plantao_id: dia3.plantaoId, posicao: 3, usuario_saida: dia3.vagas.get(3).id,
    usuario_entrada: dia3.folga.id, solicitado_por: dia3.vagas.get(3).id,
  }), 'troca pendente')

  // Troca por horas valendo: quem está de folga cobre a vaga 4 das 07h às 13h
  const dia5 = diaComPlantao(5)
  await ok(supabase.from('plantao_trocas').insert({
    plantao_id: dia5.plantaoId, posicao: 4, usuario_saida: dia5.vagas.get(4).id,
    usuario_entrada: dia5.folga.id, solicitado_por: dia5.vagas.get(4).id,
    hora_inicio: '07:00', hora_fim: '13:00', status: 'aceita', respondido_em: new Date().toISOString(),
  }), 'troca por horas')

  // Troca da vaga inteira já aceita (no passado): a vaga 10 passou para quem estava de folga
  const diaPassado = diaComPlantao(-6)
  const saiu = diaPassado.vagas.get(10)
  await ok(supabase.from('plantao_trocas').insert({
    plantao_id: diaPassado.plantaoId, posicao: 10, usuario_saida: saiu.id,
    usuario_entrada: diaPassado.folga.id, solicitado_por: saiu.id,
    status: 'aceita', respondido_em: new Date().toISOString(),
  }), 'troca aceita')
  await ok(
    supabase.from('plantao_usuarios').update({ usuario_id: diaPassado.folga.id })
      .eq('plantao_id', diaPassado.plantaoId).eq('posicao', 10),
    'troca aceita'
  )

  // Afastamentos: férias aprovadas (com plantões no período, para aparecer o "!"), congresso pendente e um recusado
  await ok(supabase.from('afastamentos').insert([
    { usuario_id: carla.id, tipo: 'ferias', data_inicio: diaRelativo(7), data_fim: diaRelativo(13), status: 'aprovado', respondido_por: escritorio, respondido_em: new Date().toISOString() },
    { usuario_id: daniel.id, tipo: 'congresso', data_inicio: diaRelativo(20), data_fim: diaRelativo(22), observacao: 'Congresso Brasileiro de Anestesiologia', status: 'pendente' },
    { usuario_id: bruno.id, tipo: 'ferias', data_inicio: diaRelativo(30), data_fim: diaRelativo(40), status: 'recusado', respondido_por: escritorio, respondido_em: new Date().toISOString() },
  ]), 'afastamentos')

  // Hospitais (um desativado) e casos fora
  const hospitais = await ok(supabase.from('hospitais').insert([
    { nome: 'Hospital São Lucas', ativo: true }, { nome: 'Hospital Santa Clara', ativo: true }, { nome: 'Hospital Antigo', ativo: false },
  ]).select('id, nome'), 'hospitais')

  await ok(supabase.from('casos_fora').insert([
    { data: diaRelativo(-2), anestesista_id: ana.id, escalado: false, cirurgiao: 'Dr. Paulo Viana', paciente_nome: 'Maria da Silva', paciente_cpf: cpfValido('123456789'), cirurgia: 'Colecistectomia', hospital_id: hospitais[0].id, recibo: 'gami', valor: 1200, criado_por: escritorio },
    { data: diaRelativo(-5), anestesista_id: igor.id, escalado: true, cirurgiao: 'Dra. Lívia Prado', paciente_nome: 'José Santos', paciente_cpf: cpfValido('987654321'), cirurgia: 'Artroscopia de joelho', hospital_id: hospitais[1].id, recibo: 'sem_recibo', criado_por: escritorio },
    { data: diaRelativo(-9), anestesista_id: juliana.id, escalado: false, cirurgiao: 'Dr. Paulo Viana', paciente_nome: 'Ana Pereira', paciente_cpf: cpfValido('111444777'), cirurgia: 'Herniorrafia', recibo: 'pessoal', valor: 850.5, comentarios: 'Paciente particular', criado_por: juliana.id },
  ]), 'casos fora')

  // Fichas anestésicas (sem foto): uma com um anestesista, outra virando a noite com dois
  await ok(supabase.from('fichas_anestesicas').insert([
    { data: diaRelativo(-1), hora_inicio: '08:00', hora_fim: '10:30', anestesista_id: ana.id, anestesista_ids: [ana.id], tipo_anestesia: 'raquianestesia', criado_por: ana.id },
    { data: diaRelativo(-3), data_fim: diaRelativo(-2), hora_inicio: '22:00', hora_fim: '02:00', anestesista_id: bruno.id, anestesista_ids: [bruno.id, igor.id], tipo_anestesia: 'outros', tipo_outro: 'Bloqueio de plexo', observacoes: 'Caso longo', valor: 2500, criado_por: escritorio },
  ]), 'fichas')

  console.log(`Pronto: ${medicos.length + 3} usuários, ${plantoes.length} plantões (${dataLocal(inicio)} a ${dataLocal(fim)}).`)
  console.log(`Senha de todos: ${SENHA}`)
  console.log('  escritorio@example.com — escritório + admin (ES)')
  console.log('  paula@example.com      — técnico (PM)')
  console.log(`  ${emailDe(ana.nome).padEnd(22)} — sócio (${SOCIOS.map(s => s[1]).join(', ')}: primeiro nome @example.com)`)
  console.log(`  ${emailDe(igor.nome).padEnd(22)} — plantonista (${PLANTONISTAS.map(s => s[1]).join(', ')}: primeiro nome @example.com)`)
  console.log('  rafael@example.com     — cadastro aguardando aprovação (não entra)')
}

main().catch(err => {
  console.error(err.message)
  process.exit(1)
})
