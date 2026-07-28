import Link from "next/link"

const features = [
  {
    title: "Calendário de Plantões",
    description: "Visualize e organize todos os seus plantões de forma clara e intuitiva, mês a mês.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
  {
    title: "Controle de Ponto",
    description: "Bata ponto no início e término de cada plantão com precisão e registros automáticos.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <polyline points="12 7 12 12 15 15" />
      </svg>
    ),
  },
  {
    title: "Notificações Inteligentes",
    description: "Receba alertas sobre novos plantões e solicitações em tempo real, sem perder nada.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
    ),
  },
  {
    title: "Troca de Plantão",
    description: "Solicite e gerencie trocas de plantão com outros médicos de forma simples e rápida.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="17 1 21 5 17 9" />
        <path d="M3 11V9a4 4 0 0 1 4-4h14" />
        <polyline points="7 23 3 19 7 15" />
        <path d="M21 13v2a4 4 0 0 1-4 4H3" />
      </svg>
    ),
  },
  {
    title: "Histórico Completo",
    description: "Acompanhe todo o seu histórico de plantões realizados com relatórios detalhados.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
  {
    title: "Acesso Seguro",
    description: "Autenticação protegida, aprovada por administradores do hospital. Apenas equipe autorizada.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6l-8-4Z" />
      </svg>
    ),
  },
]

const steps = [
  {
    number: "01",
    title: "Cadastre-se",
    description: "Preencha seus dados pessoais e profissionais. Seu CRM será validado pela equipe.",
  },
  {
    number: "02",
    title: "Aguarde Aprovação",
    description: "O administrador do hospital valida seu acesso. Você recebe notificação em até 24h.",
  },
  {
    number: "03",
    title: "Acesse e Gerencie",
    description: "Visualize sua escala, bata ponto e acompanhe tudo em tempo real pelo app.",
  },
]

const stats = [
  { value: "500+", label: "Médicos ativos" },
  { value: "12", label: "Hospitais parceiros" },
  { value: "98%", label: "Satisfação" },
]

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <header className="bg-brand-800">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center">
              <span className="text-brand-800 font-bold text-sm">P</span>
            </div>
            <span className="text-white font-semibold text-lg tracking-wide">Plantão</span>
          </div>
          <Link
            href="/login"
            className="bg-white text-brand-800 text-sm font-semibold px-5 py-2 rounded-md hover:bg-brand-50 transition-colors"
          >
            Acessar sistema
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-brand-800 text-white pt-16 pb-20 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-brand-200 text-sm font-semibold uppercase tracking-widest mb-3">
            Gestão Hospitalar
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold leading-tight mb-6">
            Escalas hospitalares<br />sob controle total
          </h1>
          <p className="text-brand-100 text-lg mb-10 max-w-xl mx-auto">
            Organize plantões, gerencie equipes e mantenha o hospital funcionando com eficiência e transparência total.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/login"
              className="w-full sm:w-auto bg-white text-brand-800 font-bold text-base px-8 py-3 rounded-md hover:bg-brand-50 transition-colors shadow-lg"
            >
              Entrar no sistema
            </Link>
            <Link
              href="/register"
              className="w-full sm:w-auto border border-brand-400 text-white font-semibold text-base px-8 py-3 rounded-md hover:bg-brand-700 transition-colors"
            >
              Criar conta gratuita
            </Link>
          </div>
        </div>

        {/* Stats */}
        <div className="max-w-3xl mx-auto mt-16 grid grid-cols-3 gap-6 text-center">
          {stats.map((s) => (
            <div key={s.label}>
              <p className="text-3xl sm:text-4xl font-bold text-white">{s.value}</p>
              <p className="text-brand-200 text-xs sm:text-sm mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <p className="text-center text-brand-700 text-sm font-semibold uppercase tracking-widest mb-2">
            Funcionalidades
          </p>
          <h2 className="text-center text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
            Por que usar o Plantão?
          </h2>
          <p className="text-center text-gray-500 mb-12 max-w-lg mx-auto">
            Tudo que você precisa para gerenciar sua rotina hospitalar.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => (
              <div
                key={f.title}
                className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="w-10 h-10 bg-brand-100 text-brand-700 rounded-lg flex items-center justify-center mb-4">
                  <div className="w-5 h-5">{f.icon}</div>
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">{f.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Como funciona */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-4xl mx-auto">
          <p className="text-center text-brand-700 text-sm font-semibold uppercase tracking-widest mb-2">
            Como Funciona
          </p>
          <h2 className="text-center text-2xl sm:text-3xl font-bold text-gray-900 mb-12">
            Simples de começar
          </h2>
          <div className="grid sm:grid-cols-3 gap-8">
            {steps.map((s) => (
              <div key={s.number} className="flex sm:flex-col gap-4">
                <div className="shrink-0 w-9 h-9 bg-brand-800 text-white font-bold text-sm rounded-lg flex items-center justify-center">
                  {s.number}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">{s.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{s.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="bg-brand-800 py-16 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">Pronto para começar?</h2>
          <p className="text-brand-200 mb-8">
            Junte-se a centenas de médicos que já organizam seus plantões de forma profissional e eficiente.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/register"
              className="w-full sm:w-auto bg-brand-500 hover:bg-brand-600 text-white font-bold text-base px-8 py-3 rounded-md transition-colors shadow-lg"
            >
              Criar conta gratuitamente
            </Link>
            <Link
              href="/login"
              className="w-full sm:w-auto border border-brand-400 text-white font-semibold text-base px-8 py-3 rounded-md hover:bg-brand-700 transition-colors"
            >
              Já tenho uma conta
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-brand-900 text-brand-200 text-center text-sm py-5">
        © {new Date().getFullYear()} Plantão — Sistema de Gestão de Escalas Hospitalares
      </footer>
    </div>
  )
}
