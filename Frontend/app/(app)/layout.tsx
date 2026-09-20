import Sidebar from "../../components/Sidebar"
import UsuarioAtualBadge from "../../components/UsuarioAtualBadge"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col md:flex-row bg-gray-50 min-h-screen">
      <Sidebar />
      <div className="flex-1 min-w-0">
        <div className="flex justify-end px-4 sm:px-6 pt-4">
          <UsuarioAtualBadge />
        </div>
        {children}
      </div>
    </div>
  )
}
