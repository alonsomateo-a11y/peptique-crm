/**
 * Plantillas de importación (migración desde los Excel de Peptique).
 * Compartido entre servidor y navegador: aquí solo hay definiciones, sin acceso a datos.
 */

export type TipoImportacion = "red" | "clientes" | "inventario" | "historial"

export type Columna = {
  clave: string
  titulo: string
  /** Otros encabezados que aceptamos (sin acentos ni mayúsculas). */
  alias: string[]
  requerida?: boolean
  ejemplo: string
  ayuda?: string
}

export type Plantilla = { tipo: TipoImportacion; titulo: string; descripcion: string; orden: string; columnas: Columna[] }

export const PLANTILLAS: Plantilla[] = [
  {
    tipo: "red",
    titulo: "Red comercial",
    descripcion: "Distribuidores y comisionistas. Quedan activos y sin PIN: el PIN se les asigna en Equipo y permisos.",
    orden: "Primero",
    columnas: [
      { clave: "nombre", titulo: "Nombre", alias: ["nombre completo", "distribuidor", "comisionista"], requerida: true, ejemplo: "Distribuidor Ejemplo" },
      { clave: "whatsapp", titulo: "WhatsApp", alias: ["telefono", "celular", "tel", "whats"], requerida: true, ejemplo: "8100000001" },
      { clave: "tipo", titulo: "Tipo", alias: ["perfil", "rol"], requerida: true, ejemplo: "Distribuidor", ayuda: "Distribuidor o Comisionista" },
      { clave: "invito", titulo: "Invitó", alias: ["invito", "distribuidor de", "equipo de", "lider", "patrocinador"], ejemplo: "", ayuda: "Nombre o WhatsApp de su distribuidor. Obligatorio para comisionistas." },
      { clave: "zona", titulo: "Zona", alias: ["ciudad", "region"], ejemplo: "Monterrey" },
    ],
  },
  {
    tipo: "clientes",
    titulo: "Clientes",
    descripcion: "Base de clientes. Si el WhatsApp ya existe, el cliente no se duplica.",
    orden: "Segundo",
    columnas: [
      { clave: "nombre", titulo: "Nombre", alias: ["cliente", "nombre completo", "paciente"], requerida: true, ejemplo: "Cliente Ejemplo" },
      { clave: "whatsapp", titulo: "WhatsApp", alias: ["telefono", "celular", "tel", "whats"], requerida: true, ejemplo: "8100000002" },
      { clave: "tipo", titulo: "Tipo", alias: ["tipo de cliente"], ejemplo: "Paciente", ayuda: "Paciente, Médico o Distribuidor. Vacío = Paciente" },
      { clave: "correo", titulo: "Correo", alias: ["email", "mail"], ejemplo: "" },
      { clave: "etiquetas", titulo: "Etiquetas", alias: ["etiqueta", "tags"], ejemplo: "VIP", ayuda: "Separadas por coma" },
      { clave: "atiende", titulo: "Lo atiende", alias: ["vendedor", "vendio", "atiende", "asesor"], ejemplo: "", ayuda: "Nombre de quien lo atiende (equipo o red)" },
      { clave: "origen", titulo: "Origen", alias: ["como llego", "fuente"], ejemplo: "Instagram" },
    ],
  },
  {
    tipo: "inventario",
    titulo: "Inventario por lote",
    descripcion: "Un renglón por lote con las piezas que hay hoy. Entra a venta general; el COA se sube después en cada lote.",
    orden: "Tercero",
    columnas: [
      { clave: "producto", titulo: "Producto", alias: ["nombre", "nombre del producto"], requerida: true, ejemplo: "BPC-157 10 mg", ayuda: "Nombre y mg, como en la etiqueta" },
      { clave: "presentacion", titulo: "Presentación", alias: ["mg", "dosis", "presentacion"], ejemplo: "", ayuda: "Opcional si ya viene en Producto" },
      { clave: "lote", titulo: "Lote del proveedor", alias: ["lote", "numero de lote", "lote origen", "batch"], ejemplo: "US-0000" },
      { clave: "piezas", titulo: "Piezas", alias: ["cantidad", "piezas disponibles", "existencia", "stock"], requerida: true, ejemplo: "10" },
      { clave: "costo_mxn", titulo: "Costo por pieza MXN", alias: ["costo", "costo mxn", "costo pieza", "costo por pieza"], ejemplo: "", ayuda: "O llena USD y tipo de cambio" },
      { clave: "costo_usd", titulo: "Costo por pieza USD", alias: ["costo usd", "usd"], ejemplo: "1" },
      { clave: "tipo_cambio", titulo: "Tipo de cambio", alias: ["tc", "dolar"], ejemplo: "18.5" },
      { clave: "llegada", titulo: "Fecha de llegada", alias: ["llegada", "fecha", "fecha de entrada"], ejemplo: "2026-10-01" },
    ],
  },
  {
    tipo: "historial",
    titulo: "Historial de ventas",
    descripcion:
      "Un renglón por producto vendido; los renglones con el mismo folio forman una venta. Entran como entregadas y pagadas, sin mover el inventario de hoy ni generar comisiones.",
    orden: "Al final",
    columnas: [
      { clave: "folio", titulo: "Folio", alias: ["numero de venta", "no venta", "venta", "ticket", "orden"], ejemplo: "1001", ayuda: "Vacío = cada renglón es una venta" },
      { clave: "fecha", titulo: "Fecha", alias: ["fecha de venta", "dia"], requerida: true, ejemplo: "2026-09-15" },
      { clave: "cliente", titulo: "Cliente", alias: ["nombre", "nombre del cliente", "paciente"], requerida: true, ejemplo: "Cliente Ejemplo" },
      { clave: "whatsapp", titulo: "WhatsApp", alias: ["telefono", "celular", "tel"], ejemplo: "8100000002", ayuda: "Obligatorio si el cliente no existe todavía" },
      { clave: "producto", titulo: "Producto", alias: ["nombre del producto", "articulo"], requerida: true, ejemplo: "BPC-157 10 mg" },
      { clave: "presentacion", titulo: "Presentación", alias: ["mg", "dosis"], ejemplo: "" },
      { clave: "piezas", titulo: "Piezas", alias: ["cantidad", "pzas"], requerida: true, ejemplo: "1" },
      { clave: "precio", titulo: "Precio por pieza", alias: ["precio", "precio unitario", "precio pieza"], ejemplo: "", ayuda: "O el importe del renglón" },
      { clave: "importe", titulo: "Importe", alias: ["total", "monto", "subtotal", "precio cobrado"], ejemplo: "1" },
      { clave: "metodo", titulo: "Forma de pago", alias: ["metodo", "metodo de pago", "pago"], ejemplo: "Efectivo", ayuda: "Efectivo, Tarjeta o Transferencia" },
      { clave: "vendio", titulo: "Vendió", alias: ["vendedor", "atendio", "asesor"], ejemplo: "", ayuda: "Vacío = quien importa" },
      { clave: "lote", titulo: "Lote", alias: ["lote del proveedor", "numero de lote"], ejemplo: "" },
    ],
  },
]

export const plantillaDe = (tipo: string) => PLANTILLAS.find((p) => p.tipo === tipo)

export type EstadoFila = "nueva" | "existe" | "error"

export type FilaRevisada = {
  /** Renglón del archivo (1 = encabezados). */
  renglon: number
  estado: EstadoFila
  /** Resumen legible: "BPC-157 10 mg · 10 pzas". */
  resumen: string
  mensajes: string[]
}

export type Revision = {
  ok?: boolean
  error?: string
  archivo?: string
  /** Columnas reconocidas y las que faltan. */
  reconocidas?: string[]
  faltan?: string[]
  filas?: FilaRevisada[]
  conteo?: Record<EstadoFila, number>
  /** Unidades que se crean (ventas en el historial, que agrupan renglones). */
  aCrear?: number
  importado?: number
}
