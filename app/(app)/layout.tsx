import { Sidebar } from "@/components/app/sidebar"
import { Topbar } from "@/components/app/topbar"
import { obtenerSesion } from "@/lib/sesion"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const sesion = await obtenerSesion()
  return (
    <div className="flex min-h-dvh">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-card focus:px-3 focus:py-2 focus:ring-3 focus:ring-ring"
      >
        Saltar al contenido
      </a>
      <Sidebar
        perfil={sesion.perfil}
        nombre={sesion.nombre}
        iniciales={sesion.iniciales}
        pendientes={{ "/red": 1, "/recompras": 6 }}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main id="contenido" className="flex flex-col gap-4 px-6 py-[22px]">
          {children}
        </main>
      </div>
    </div>
  )
}
