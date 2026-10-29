import type { Metadata } from "next"

import { PageHeader } from "@/components/app/page-header"
import { exigirAdmin } from "@/lib/sesion"

import { cargarProductos } from "./datos"
import { ProductosVista } from "./productos-vista"

export const metadata: Metadata = { title: "Productos" }

export default async function Productos() {
  await exigirAdmin()
  const productos = await cargarProductos()
  const visibles = productos.filter((p) => p.visible).length
  const familias = [...new Set(productos.map((p) => p.familia))].sort((a, b) => a.localeCompare(b, "es"))

  return (
    <>
      <PageHeader
        ruta={[["Inicio", "/inicio"], ["Productos"]]}
        titulo="Productos"
        descripcion={
          productos.length
            ? `${visibles} visibles · ${productos.length - visibles} ocultos · margen calculado contra el lote que está saliendo`
            : "Precios, protocolos por etapa y margen por lote"
        }
      />
      <ProductosVista productos={productos} familias={familias} />
    </>
  )
}
