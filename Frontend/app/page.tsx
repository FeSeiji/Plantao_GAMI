import Link from "next/link"

const features = [
  {
    title: "Escalas Centralizadas",
    description: "Visualize e gerencie todas as escalas hospitalares em um único lugar, com acesso em tempo real.",
  },
  {
    title: "Controle de Acesso por Papel",
    description: "Perfis distintos para anestesistas, técnicos, coordenadores e administradores.",
  },
  {
    title: "Autenticação Segura",
    description: "Acesso protegido com JWT, garantindo que apenas a equipe autorizada visualize os dados.",
  },
]

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <header className="bg-brand-800 shadow-md">
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
      <section className="bg-brand-800 text-white py-20 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-brand-200 text-sm font-medium uppercase tracking-widest mb-3">
            Gestão Hospitalar
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold leading-tight mb-6">
            Escalas hospitalares<br />sob controle total
          </h1>
          <p className="text-brand-100 text-lg mb-10 max-w-xl mx-auto">
            Organize plantões, gerencie equipes e mantenha o hospital funcionando com eficiência e transparência.
          </p>
          <Link
            href="/login"
            className="inline-block bg-white text-brand-800 font-bold text-base px-8 py-3 rounded-md hover:bg-brand-50 transition-colors shadow-lg"
          >
            Entrar no sistema
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6 bg-gray-50 flex-1">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-center text-2xl font-bold text-gray-800 mb-12">
            Por que usar o Plantão?
          </h2>
          <div className="grid sm:grid-cols-3 gap-8">
            {features.map((f) => (
              <div
                key={f.title}
                className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="w-10 h-10 bg-brand-100 rounded-lg flex items-center justify-center mb-4">
                  <div className="w-4 h-4 bg-brand-700 rounded-sm" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">{f.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{f.description}</p>
              </div>
            ))}
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
