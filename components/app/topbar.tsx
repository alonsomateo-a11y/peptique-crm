import Link from "next/link"
import { Search, Store } from "lucide-react"

import { Button } from "@/components/ui/button"

export function Topbar() {
  return (
    <header className="flex h-14 items-center gap-2.5 border-b px-6">
      <button
        type="button"
        className="flex h-9 w-[380px] max-w-full items-center gap-2 rounded-[10px] border bg-card px-3 text-[13px] text-muted-foreground"
      >
        <Search className="size-4" aria-hidden />
        Buscar clientes, ventas, lotes…
        <kbd className="ml-auto rounded-[5px] border bg-hueso-2 px-1.5 text-[11px]">⌘K</kbd>
      </button>
      <div className="flex-1" />
      <Button variant="outline" size="lg" asChild>
        <Link href="/mostrador">
          <Store aria-hidden />
          Abrir mostrador
        </Link>
      </Button>
    </header>
  )
}
