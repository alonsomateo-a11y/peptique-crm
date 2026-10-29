"use client"

import { useState } from "react"
import { Pencil } from "lucide-react"

import { Button } from "@/components/ui/button"

import { ClienteDrawer } from "../cliente-drawer"
import type { ClienteFila } from "../tipos"

export function EditarCliente({
  cliente,
  clientes,
  vendedores,
}: {
  cliente: ClienteFila
  clientes: Pick<ClienteFila, "id" | "nombre" | "whatsapp">[]
  vendedores: { id: string; nombre: string }[]
}) {
  const [abierto, setAbierto] = useState(false)
  return (
    <>
      <Button variant="outline" size="lg" onClick={() => setAbierto(true)}>
        <Pencil aria-hidden />
        Editar
      </Button>
      <ClienteDrawer key={String(abierto)} abierto={abierto} onOpenChange={setAbierto} cliente={cliente} clientes={clientes} vendedores={vendedores} />
    </>
  )
}
