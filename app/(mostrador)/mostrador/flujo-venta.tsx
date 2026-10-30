"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronLeft,
  Loader2,
  MessageCircle,
  Minus,
  Plus,
  Search,
  Store,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { Segmentado } from "@/components/app/segmentado";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatoMoneda, formatoMonedaCentavos } from "@/lib/format";
import { formatoWhatsapp, ligaWhatsapp } from "@/lib/telefono";
import { cn } from "@/lib/utils";
import type { Canal, Metodo, TipoCliente, VentaRegistrada } from "@/lib/ventas";

import {
  abrirCaja,
  aplicarDosisMostrador,
  buscarClientes,
  clientePorId,
  crearClienteRapido,
  etapasCliente,
  firmarWaiver,
  vender,
} from "./actions";
import type { Caja, ClienteMostrador, ProductoMostrador } from "./tipos";

type Paso = "donde" | "cliente" | "waiver" | "productos" | "cobro" | "listo";
type Carrito = Record<string, number>;

const iniciales = (n: string) =>
  n
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

const num = (v: string) => Number(v.replace(/[$,\s]/g, "")) || 0;

export function FlujoVenta({
  caja,
  productos,
  recientes,
  waiver,
  clienteInicial,
  soloEnPersona = false,
  red = false,
  datosPago = null,
}: {
  caja: Caja;
  productos: ProductoMostrador[];
  recientes: ClienteMostrador[];
  waiver: string;
  clienteInicial: string | null;
  /** Admin comercial: siempre vende en persona, sin caja. */
  soloEnPersona?: boolean;
  /** Distribuidor o comisionista: vende por la red (transferencia o terminal, se entrega con el pago reflejado). */
  red?: boolean;
  /** Texto con los datos de pago que se manda al cliente por WhatsApp (red). */
  datosPago?: string | null;
}) {
  const sinDonde = soloEnPersona || red;
  const [paso, setPaso] = useState<Paso>(sinDonde ? "cliente" : "donde");
  const [canal, setCanal] = useState<Canal>(
    red ? "red" : soloEnPersona ? "en_persona" : "mostrador_caja",
  );
  const [cliente, setCliente] = useState<ClienteMostrador | null>(null);
  const [etapas, setEtapas] = useState<Record<string, number>>({});
  const [carrito, setCarrito] = useState<Carrito>({});
  const [venta, setVenta] = useState<VentaRegistrada | null>(null);
  const [ocupado, iniciar] = useTransition();

  const tipo: TipoCliente = cliente?.tipo ?? "paciente";
  const lineas = Object.entries(carrito)
    .filter(([, n]) => n > 0)
    .map(([id, n]) => ({
      producto: productos.find((p) => p.id === id)!,
      cantidad: n,
    }))
    .filter((l) => l.producto);
  const piezas = lineas.reduce((s, l) => s + l.cantidad, 0);
  const total = lineas.reduce(
    (s, l) => s + (l.producto.precios[tipo] ?? 0) * l.cantidad,
    0,
  );

  function elegirCliente(c: ClienteMostrador) {
    setCliente(c);
    setCarrito({});
    if (!c.waiver) return setPaso("waiver");
    iniciar(async () => {
      setEtapas(await etapasCliente(c.id));
      setPaso("productos");
    });
  }

  function nuevaVenta() {
    setCliente(null);
    setCarrito({});
    setVenta(null);
    setPaso("cliente");
  }

  // Desde la ficha del cliente (/mostrador?cliente=<id>) se salta la búsqueda.
  const [preCliente, setPreCliente] = useState<ClienteMostrador | null>(null);
  useEffect(() => {
    if (!clienteInicial) return;
    clientePorId(clienteInicial).then((c) => {
      if (c && sinDonde) elegirCliente(c);
      else setPreCliente(c);
    });
    // elegirCliente solo se usa al cargar el cliente inicial.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteInicial, sinDonde]);

  const pasoNumero =
    paso === "cliente" || paso === "waiver"
      ? 1
      : paso === "productos"
        ? 2
        : paso === "cobro"
          ? 3
          : 0;

  return (
    <>
      {pasoNumero > 0 && (
        <div
          className="flex flex-col gap-1.5"
          aria-label={`Paso ${pasoNumero} de 3`}
        >
          <div className="flex gap-1.5" aria-hidden>
            {[1, 2, 3].map((i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 flex-1 rounded-full",
                  i <= pasoNumero ? "bg-chart-1" : "bg-border",
                )}
              />
            ))}
          </div>
          <div className="flex text-[11.5px] font-bold">
            {["Cliente", "Productos", "Cobro"].map((t, i) => (
              <span
                key={t}
                className={cn(
                  "flex-1",
                  i === 1 && "text-center",
                  i === 2 && "text-right",
                  i + 1 !== pasoNumero && "text-muted-foreground",
                )}
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      {paso === "donde" && (
        <Donde
          caja={caja}
          onElegir={(c) => {
            setCanal(c);
            if (preCliente) {
              elegirCliente(preCliente);
              setPreCliente(null);
            } else setPaso("cliente");
          }}
        />
      )}
      {paso === "cliente" && (
        <PasoCliente
          recientes={recientes}
          canal={canal}
          onElegir={elegirCliente}
          onAtras={sinDonde ? undefined : () => setPaso("donde")}
          cargando={ocupado}
        />
      )}
      {paso === "waiver" && cliente && (
        <PasoWaiver
          cliente={cliente}
          texto={waiver}
          onFirmado={() => elegirCliente({ ...cliente, waiver: true })}
          onAtras={() => setPaso("cliente")}
        />
      )}
      {paso === "productos" && cliente && (
        <PasoProductos
          cliente={cliente}
          productos={productos}
          etapas={etapas}
          carrito={carrito}
          setCarrito={setCarrito}
          piezas={piezas}
          total={total}
          onCambiarCliente={() => setPaso("cliente")}
          onContinuar={() => setPaso("cobro")}
        />
      )}
      {paso === "cobro" && cliente && (
        <PasoCobro
          canal={canal}
          cliente={cliente}
          lineas={lineas}
          etapas={etapas}
          total={total}
          setCarrito={setCarrito}
          onAtras={() => setPaso("productos")}
          onVendida={(v) => {
            setVenta(v);
            setPaso("listo");
          }}
        />
      )}
      {paso === "listo" &&
        venta &&
        (canal === "red" ? (
          <EsperandoPago
            venta={venta}
            datosPago={datosPago}
            onNueva={nuevaVenta}
          />
        ) : (
          <Listo venta={venta} canal={canal} onNueva={nuevaVenta} />
        ))}
    </>
  );
}

/* ───────────── ¿Dónde vendes? ───────────── */

function Donde({
  caja,
  onElegir,
}: {
  caja: Caja;
  onElegir: (c: Canal) => void;
}) {
  const [fondo, setFondo] = useState("2000");
  const [error, setError] = useState<string | null>(null);
  const [abriendo, iniciar] = useTransition();

  function abrir() {
    setError(null);
    iniciar(async () => {
      const r = await abrirCaja(num(fondo));
      if (r.error) setError(r.error);
      else onElegir("mostrador_caja");
    });
  }

  return (
    <>
      <h1 className="text-[24px] leading-tight font-medium">
        ¿Dónde vas a vender?
      </h1>
      <section className="flex flex-col gap-3 rounded-2xl border-2 border-espresso bg-card p-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-10 items-center justify-center rounded-xl bg-ok-bg text-ok">
            <Store className="size-5" aria-hidden />
          </span>
          <div className="flex-1">
            <b className="text-[16px]">Venta en caja</b>
            <span className="block text-[12px] text-muted-foreground">
              En el mostrador · efectivo, cambio y corte
            </span>
          </div>
        </div>
        {caja ? (
          <>
            <p className="rounded-xl bg-ok-bg px-3 py-2 text-[12.5px] font-semibold text-ok">
              Caja abierta{caja.abiertaPor && ` por ${caja.abiertaPor}`} · fondo{" "}
              {formatoMoneda(caja.fondo)}
            </p>
            <Button
              size="lg"
              className="h-12 text-[15px]"
              onClick={() => onElegir("mostrador_caja")}
            >
              Vender en caja
            </Button>
          </>
        ) : (
          <>
            <label className="flex flex-col gap-1.5 text-[12.5px] font-semibold">
              Fondo de caja
              <Input
                inputMode="decimal"
                value={fondo}
                onChange={(e) => setFondo(e.target.value)}
                className="num h-11 text-lg font-bold"
              />
            </label>
            {error && (
              <p role="alert" className="text-[12px] font-semibold text-crit">
                {error}
              </p>
            )}
            <Button
              size="lg"
              className="h-12 text-[15px]"
              onClick={abrir}
              disabled={abriendo}
            >
              {abriendo && <Loader2 className="animate-spin" aria-hidden />}
              Abrir caja y vender
            </Button>
          </>
        )}
      </section>
      <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-10 items-center justify-center rounded-xl bg-hueso">
            <Users className="size-5" aria-hidden />
          </span>
          <div className="flex-1">
            <b className="text-[16px]">Venta en persona</b>
            <span className="block text-[12px] text-muted-foreground">
              Fuera de la caja · el efectivo queda “por entregar” a tu nombre
            </span>
          </div>
        </div>
        <Button
          variant="outline"
          size="lg"
          className="h-12 text-[15px]"
          onClick={() => onElegir("en_persona")}
        >
          Vender en persona
        </Button>
      </section>
    </>
  );
}

/* ───────────── Paso 1: cliente ───────────── */

function PasoCliente({
  recientes,
  canal,
  onElegir,
  onAtras,
  cargando,
}: {
  recientes: ClienteMostrador[];
  canal: Canal;
  onElegir: (c: ClienteMostrador) => void;
  onAtras?: () => void;
  cargando: boolean;
}) {
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<ClienteMostrador[] | null>(null);
  const [buscando, iniciar] = useTransition();
  const [nuevo, setNuevo] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) return;
    const t = setTimeout(
      () => iniciar(async () => setResultados(await buscarClientes(q))),
      250,
    );
    return () => clearTimeout(t);
  }, [q]);

  const lista = q.trim().length >= 2 ? (resultados ?? []) : recientes;

  return (
    <>
      <div className="flex items-center gap-2">
        {onAtras && (
          <button
            type="button"
            onClick={onAtras}
            aria-label="Cambiar dónde vendes"
            className="inline-flex size-9 items-center justify-center rounded-xl border bg-card"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </button>
        )}
        <h1 className="flex-1 text-[22px] font-medium">¿Quién compra?</h1>
        <span className="rounded-full bg-hueso px-2.5 py-0.5 text-[11.5px] font-semibold">
          {canal === "mostrador_caja"
            ? "En caja"
            : canal === "red"
              ? "Por la red"
              : "En persona"}
        </span>
      </div>
      {nuevo ? (
        <ClienteNuevo onCreado={onElegir} onCancelar={() => setNuevo(false)} />
      ) : (
        <>
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-taupe"
              aria-hidden
            />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nombre o WhatsApp"
              aria-label="Buscar cliente por nombre o WhatsApp"
              className="h-12 border-2 border-espresso bg-card pl-10 text-[15px]"
              autoFocus
            />
            {(buscando || cargando) && (
              <Loader2
                className="absolute top-1/2 right-3.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
                aria-label="Buscando"
              />
            )}
          </div>
          <span className="text-[11px] font-bold tracking-[0.06em] text-muted-foreground uppercase">
            {q.trim().length >= 2 ? "Resultados" : "Clientes recientes"}
          </span>
          <ul className="flex flex-col divide-y overflow-hidden rounded-2xl border bg-card">
            {lista.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onElegir(c)}
                  disabled={cargando}
                  className="flex w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-hueso-2 focus-visible:bg-hueso-2 focus-visible:outline-none"
                >
                  <span className="inline-flex size-9 items-center justify-center rounded-full bg-bruma text-[12px] font-extrabold">
                    {iniciales(c.nombre)}
                  </span>
                  <span className="flex-1">
                    <b className="text-[14px]">{c.nombre}</b>
                    <span className="block text-[12px] text-muted-foreground">
                      {formatoWhatsapp(c.whatsapp)}
                    </span>
                  </span>
                  {c.planDosis && (
                    <span className="rounded-full bg-hueso px-2 py-0.5 text-[11px] font-semibold">
                      Plan por dosis
                    </span>
                  )}
                  {!c.waiver && (
                    <span className="rounded-full bg-warn-bg px-2 py-0.5 text-[11px] font-semibold text-warn">
                      Sin waiver
                    </span>
                  )}
                  <ArrowRight
                    className="size-4 text-muted-foreground"
                    aria-hidden
                  />
                </button>
              </li>
            ))}
            {lista.length === 0 && (
              <li className="px-4 py-6 text-center text-[13px] text-muted-foreground">
                {q.trim().length >= 2
                  ? "No hay coincidencias."
                  : "Aún no hay ventas recientes."}
              </li>
            )}
          </ul>
          <Button
            variant="outline"
            size="lg"
            className="h-12 text-[15px]"
            onClick={() => setNuevo(true)}
          >
            <UserPlus aria-hidden />
            Cliente nuevo
          </Button>
        </>
      )}
    </>
  );
}

function ClienteNuevo({
  onCreado,
  onCancelar,
}: {
  onCreado: (c: ClienteMostrador) => void;
  onCancelar: () => void;
}) {
  const [nombre, setNombre] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [tipo, setTipo] = useState<TipoCliente>("paciente");
  const [error, setError] = useState<string | null>(null);
  const [guardando, iniciar] = useTransition();

  return (
    <form
      className="flex flex-col gap-3 rounded-2xl border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        iniciar(async () => {
          const r = await crearClienteRapido({ nombre, whatsapp, tipo });
          if (r.cliente) onCreado(r.cliente);
          else setError(r.error ?? "No se pudo dar de alta.");
        });
      }}
    >
      <b className="text-[16px]">Cliente nuevo</b>
      <label className="flex flex-col gap-1.5 text-[12.5px] font-semibold">
        Nombre completo
        <Input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="h-11 text-[15px]"
          autoComplete="off"
          autoFocus
        />
      </label>
      <label className="flex flex-col gap-1.5 text-[12.5px] font-semibold">
        WhatsApp
        <Input
          value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
          type="tel"
          inputMode="tel"
          className="h-11 text-[15px]"
          autoComplete="off"
        />
      </label>
      <div className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-semibold">Tipo</span>
        <Segmentado
          name="tipo"
          etiqueta="Tipo de cliente"
          valor={tipo}
          onChange={setTipo}
          opciones={[
            { valor: "paciente", texto: "Paciente" },
            { valor: "medico", texto: "Médico" },
            { valor: "distribuidor", texto: "Distribuidor" },
          ]}
        />
      </div>
      {error && (
        <p
          role="alert"
          className="flex items-center gap-2 text-[12.5px] font-semibold text-crit"
        >
          <AlertTriangle className="size-4" aria-hidden />
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-11 flex-1"
          onClick={onCancelar}
        >
          Cancelar
        </Button>
        <Button
          type="submit"
          size="lg"
          className="h-11 flex-1"
          disabled={guardando}
        >
          {guardando && <Loader2 className="animate-spin" aria-hidden />}
          Continuar
        </Button>
      </div>
    </form>
  );
}

/* ───────────── Waiver ───────────── */

function PasoWaiver({
  cliente,
  texto,
  onFirmado,
  onAtras,
}: {
  cliente: ClienteMostrador;
  texto: string;
  onFirmado: () => void;
  onAtras: () => void;
}) {
  const [nombre, setNombre] = useState(cliente.nombre);
  const [acepta, setAcepta] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, iniciar] = useTransition();
  const primerNombre = cliente.nombre.split(" ")[0];

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onAtras}
          aria-label="Cambiar cliente"
          className="inline-flex size-9 items-center justify-center rounded-xl border bg-card"
        >
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        <h1 className="text-[22px] font-medium">Firma del waiver</h1>
      </div>
      <p className="text-[13px] text-muted-foreground">
        Solo en la primera compra. Pásale el celular a {primerNombre}.
      </p>
      <div className="rounded-2xl border bg-card p-4 text-[14px] leading-relaxed">
        {texto}
      </div>
      <label className="flex flex-col gap-1.5 text-[12.5px] font-semibold">
        Nombre completo de quien firma
        <Input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="h-12 text-[16px]"
          autoComplete="off"
        />
      </label>
      <label className="flex items-start gap-3 rounded-2xl border bg-card p-3.5 text-[14px]">
        <input
          type="checkbox"
          checked={acepta}
          onChange={(e) => setAcepta(e.target.checked)}
          className="mt-0.5 size-5 accent-[var(--color-espresso)]"
        />
        <span>
          <b>{nombre.trim() || primerNombre}</b> leyó y acepta el waiver
        </span>
      </label>
      {error && (
        <p role="alert" className="text-[12.5px] font-semibold text-crit">
          {error}
        </p>
      )}
      <Barra etiqueta="Paso 1 de 3" valor="Waiver">
        <Button
          size="lg"
          className="h-12 px-5 text-[15px]"
          disabled={!acepta || nombre.trim().length < 4 || guardando}
          onClick={() =>
            iniciar(async () => {
              const r = await firmarWaiver(cliente.id, nombre);
              if (r.error) setError(r.error);
              else onFirmado();
            })
          }
        >
          {guardando && <Loader2 className="animate-spin" aria-hidden />}
          Guardar y continuar
        </Button>
      </Barra>
    </>
  );
}

/* ───────────── Paso 2: productos ───────────── */

function PasoProductos({
  cliente,
  productos,
  etapas,
  carrito,
  setCarrito,
  piezas,
  total,
  onCambiarCliente,
  onContinuar,
}: {
  cliente: ClienteMostrador;
  productos: ProductoMostrador[];
  etapas: Record<string, number>;
  carrito: Carrito;
  setCarrito: (fn: (c: Carrito) => Carrito) => void;
  piezas: number;
  total: number;
  onCambiarCliente: () => void;
  onContinuar: () => void;
}) {
  const [q, setQ] = useState("");
  const [familia, setFamilia] = useState<string | null>(null);
  const familias = useMemo(
    () => [...new Set(productos.map((p) => p.familia))],
    [productos],
  );

  // Agrupa presentaciones del mismo producto en una tarjeta.
  const grupos = useMemo(() => {
    const t = q.trim().toLowerCase();
    const m = new Map<string, ProductoMostrador[]>();
    for (const p of productos) {
      if (familia && p.familia !== familia) continue;
      if (t && !`${p.nombre} ${p.presentacion}`.toLowerCase().includes(t))
        continue;
      const k = `${p.familia}|${p.nombre}`;
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return [...m.values()];
  }, [productos, q, familia]);

  const disponible = (p: ProductoMostrador) =>
    p.general + ((etapas[p.id] ?? 1) > 1 ? p.recurrentes : 0);

  return (
    <>
      <TarjetaCliente cliente={cliente} onCambiar={onCambiarCliente} />
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-taupe"
          aria-hidden
        />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Producto o dosis"
          aria-label="Buscar producto"
          className="h-11 bg-card pl-10"
        />
      </div>
      <div
        className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1"
        role="group"
        aria-label="Familias"
      >
        {[null, ...familias].map((f) => (
          <button
            key={f ?? "todas"}
            type="button"
            aria-pressed={familia === f}
            onClick={() => setFamilia(f)}
            className={cn(
              "h-8 shrink-0 rounded-full border px-3 text-[12.5px] font-semibold whitespace-nowrap",
              familia === f
                ? "border-espresso bg-espresso text-hueso"
                : "bg-card",
            )}
          >
            {f ?? "Todas"}
          </button>
        ))}
      </div>
      <p className="text-[12px] text-muted-foreground">
        La etapa del protocolo y el precio (
        {cliente.tipo === "medico"
          ? "médico"
          : cliente.tipo === "distribuidor"
            ? "distribuidor"
            : "público"}
        ) se asignan solos.
      </p>

      {grupos.map((g) => {
        const etapa = etapas[g[0].id] ?? 1;
        return (
          <section
            key={`${g[0].familia}|${g[0].nombre}`}
            className="flex flex-col gap-2.5 rounded-2xl border bg-card p-3.5"
          >
            <div className="flex items-center gap-2">
              <span className="flex-1 text-[11px] font-bold tracking-[0.06em] text-muted-foreground uppercase">
                {g[0].familia}
              </span>
              <span className="rounded-full bg-ok-bg px-2 py-0.5 text-[11px] font-semibold text-ok">
                Etapa {etapa}
              </span>
            </div>
            <h2 className="font-serif text-[20px] leading-none">
              {g[0].nombre}
            </h2>
            <div className="flex flex-wrap gap-2">
              {g.map((p) => {
                const hay = disponible(p);
                const enCarrito = carrito[p.id] ?? 0;
                const precio = p.precios[cliente.tipo];
                const agotado = hay <= enCarrito || precio === null;
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={agotado}
                    onClick={() =>
                      setCarrito((c) => ({ ...c, [p.id]: (c[p.id] ?? 0) + 1 }))
                    }
                    aria-label={`Agregar ${p.nombre} ${p.presentacion}, ${precio === null ? "sin precio" : formatoMoneda(precio)}, quedan ${hay}`}
                    className={cn(
                      "relative flex min-w-[96px] flex-1 flex-col items-start gap-0.5 rounded-xl border px-3 py-2 text-left disabled:opacity-50",
                      enCarrito > 0
                        ? "border-2 border-espresso bg-hueso-2"
                        : "bg-card hover:border-espresso",
                    )}
                  >
                    <b className="num text-[15px]">{p.presentacion}</b>
                    <span className="num text-[13px] font-bold">
                      {precio === null ? "—" : formatoMoneda(precio)}
                    </span>
                    <span
                      className={cn(
                        "text-[11.5px]",
                        hay <= 5
                          ? "font-bold text-warn"
                          : "text-muted-foreground",
                      )}
                    >
                      {hay === 0 ? "Agotado" : `Quedan ${hay}`}
                    </span>
                    {enCarrito > 0 && (
                      <span className="absolute -top-2 -right-2 inline-flex size-6 items-center justify-center rounded-full bg-espresso text-[12px] font-bold text-hueso">
                        {enCarrito}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
      {grupos.length === 0 && (
        <p className="py-6 text-center text-[13px] text-muted-foreground">
          No hay productos con ese nombre.
        </p>
      )}

      <Barra
        etiqueta={piezas === 1 ? "1 pieza" : `${piezas} piezas`}
        valor={formatoMoneda(total)}
      >
        <Button
          size="lg"
          className="h-12 px-5 text-[15px]"
          disabled={!piezas}
          onClick={onContinuar}
        >
          Continuar <ArrowRight aria-hidden />
        </Button>
      </Barra>
    </>
  );
}

/* ───────────── Paso 3: cobro ───────────── */

function PasoCobro({
  canal,
  cliente,
  lineas,
  etapas,
  total,
  setCarrito,
  onAtras,
  onVendida,
}: {
  canal: Canal;
  cliente: ClienteMostrador;
  lineas: { producto: ProductoMostrador; cantidad: number }[];
  etapas: Record<string, number>;
  total: number;
  setCarrito: (fn: (c: Carrito) => Carrito) => void;
  onAtras: () => void;
  onVendida: (v: VentaRegistrada) => void;
}) {
  const piezas = lineas.reduce((s, l) => s + l.cantidad, 0);
  const [forma, setForma] = useState<"completo" | "por_dosis">("completo");
  const esRed = canal === "red";
  const [metodo, setMetodo] = useState<Metodo>(
    esRed ? "transferencia" : "efectivo",
  );
  const [recibe, setRecibe] = useState("");
  const [referencia, setReferencia] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cobrando, iniciar] = useTransition();

  const formaEfectiva = piezas === 1 && !esRed ? forma : "completo";
  const pagos = lineas[0]?.producto.pagosPorDosis ?? 4;
  const hoy = formaEfectiva === "por_dosis" ? Math.ceil(total / pagos) : total;
  const recibido = num(recibe);
  const cambio = metodo === "efectivo" && recibido ? recibido - hoy : 0;

  useEffect(() => {
    if (!lineas.length) onAtras();
  }, [lineas.length, onAtras]);

  function cobrar() {
    setError(null);
    iniciar(async () => {
      const r = await vender({
        canal,
        clienteId: cliente.id,
        items: lineas.map((l) => ({
          productoId: l.producto.id,
          cantidad: l.cantidad,
        })),
        forma: formaEfectiva,
        metodo,
        recibido: metodo === "efectivo" && recibido ? recibido : null,
        referencia: referencia.trim() || null,
      });
      if (r.venta) onVendida(r.venta);
      else setError(r.error ?? "No se pudo cobrar.");
    });
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onAtras}
          aria-label="Regresar a productos"
          className="inline-flex size-9 items-center justify-center rounded-xl border bg-card"
        >
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        <h1 className="flex-1 text-[22px] font-medium">Cobro</h1>
        <span className="text-[12.5px] text-muted-foreground">
          {cliente.nombre}
        </span>
      </div>

      <ul className="flex flex-col gap-2">
        {lineas.map(({ producto: p, cantidad }) => (
          <li
            key={p.id}
            className="flex items-center gap-3 rounded-2xl border bg-card px-3.5 py-3"
          >
            <div className="flex-1">
              <b className="font-serif text-[17px]">
                {p.nombre} · {p.presentacion}
              </b>
              <span className="block text-[12px] text-muted-foreground">
                {formatoMoneda(p.precios[cliente.tipo] ?? 0)} · protocolo etapa{" "}
                {etapas[p.id] ?? 1}
              </span>
            </div>
            <div className="flex items-center rounded-xl border">
              <button
                type="button"
                aria-label={
                  cantidad === 1
                    ? `Quitar ${p.nombre}`
                    : `Una pieza menos de ${p.nombre}`
                }
                onClick={() =>
                  setCarrito((c) => ({ ...c, [p.id]: cantidad - 1 }))
                }
                className="inline-flex size-9 items-center justify-center"
              >
                {cantidad === 1 ? (
                  <Trash2 className="size-4" aria-hidden />
                ) : (
                  <Minus className="size-4" aria-hidden />
                )}
              </button>
              <b className="num w-6 text-center" aria-live="polite">
                {cantidad}
              </b>
              <button
                type="button"
                aria-label={`Una pieza más de ${p.nombre}`}
                onClick={() =>
                  setCarrito((c) => ({ ...c, [p.id]: cantidad + 1 }))
                }
                className="inline-flex size-9 items-center justify-center"
              >
                <Plus className="size-4" aria-hidden />
              </button>
            </div>
          </li>
        ))}
      </ul>

      {!esRed && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-[14px] font-bold">¿Cómo lo paga?</legend>
          <div className="grid grid-cols-2 gap-2.5">
            {(["completo", "por_dosis"] as const).map((f) => (
              <label
                key={f}
                className={cn(
                  "flex cursor-pointer flex-col gap-0.5 rounded-2xl border bg-card p-3 has-checked:border-2 has-checked:border-espresso has-focus-visible:ring-3 has-focus-visible:ring-ring",
                  f === "por_dosis" &&
                    piezas !== 1 &&
                    "cursor-not-allowed opacity-50",
                )}
              >
                <input
                  type="radio"
                  name="forma"
                  value={f}
                  checked={formaEfectiva === f}
                  disabled={f === "por_dosis" && piezas !== 1}
                  onChange={() => setForma(f)}
                  className="sr-only"
                />
                <b className="text-[14px]">
                  {f === "completo" ? "Completo" : "Por dosis"}
                </b>
                <span className="num text-[12.5px] text-muted-foreground">
                  {f === "completo"
                    ? `${formatoMoneda(total)} hoy`
                    : `${pagos} pagos de ${formatoMoneda(Math.ceil(total / pagos))}`}
                </span>
              </label>
            ))}
          </div>
          {piezas !== 1 && (
            <span className="text-[11.5px] text-muted-foreground">
              Por dosis es para una sola pieza.
            </span>
          )}
          {formaEfectiva === "por_dosis" && (
            <span className="text-[11.5px] text-muted-foreground">
              Hoy paga la dosis 1. Cada pago habilita su dosis.
            </span>
          )}
        </fieldset>
      )}

      <div className="flex flex-col gap-2">
        <b className="text-[14px]">Método de pago</b>
        <Segmentado
          name="metodo"
          etiqueta="Método de pago"
          valor={metodo}
          onChange={setMetodo}
          opciones={
            esRed
              ? [
                  { valor: "transferencia", texto: "Transferencia" },
                  { valor: "tarjeta", texto: "Terminal" },
                ]
              : [
                  { valor: "efectivo", texto: "Efectivo" },
                  { valor: "tarjeta", texto: "Tarjeta" },
                  { valor: "transferencia", texto: "Transferencia" },
                ]
          }
        />
      </div>

      {esRed ? (
        <p className="rounded-xl border border-[#eed9a8] bg-warn-bg px-3.5 py-3 text-[13px] text-warn">
          <b>Peptique te entrega el producto cuando el pago se refleje.</b> Se
          aparta en tránsito con una referencia para el cliente. Sin efectivo y
          sin descuentos.
        </p>
      ) : metodo === "efectivo" ? (
        <div className="grid grid-cols-2 gap-2.5">
          <label className="flex flex-col gap-1 text-[12px] font-bold text-muted-foreground">
            Recibe
            <Input
              inputMode="decimal"
              value={recibe}
              onChange={(e) => setRecibe(e.target.value)}
              placeholder={formatoMoneda(hoy)}
              className="num h-12 bg-card text-[20px] font-extrabold text-foreground"
            />
          </label>
          <div className="flex flex-col gap-1 text-[12px] font-bold text-muted-foreground">
            Su cambio
            <output
              className={cn(
                "num flex h-12 items-center rounded-lg px-3 text-[20px] font-extrabold",
                cambio < 0 ? "bg-crit-bg text-crit" : "bg-ok-bg text-ok",
              )}
            >
              {recibido ? formatoMonedaCentavos(cambio) : "—"}
            </output>
          </div>
        </div>
      ) : (
        <label className="flex flex-col gap-1.5 text-[12.5px] font-semibold">
          {metodo === "tarjeta"
            ? "Autorización de la terminal"
            : "Referencia de la transferencia"}{" "}
          (opcional)
          <Input
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
            className="h-11 bg-card"
            autoComplete="off"
          />
        </label>
      )}

      {canal === "en_persona" && metodo === "efectivo" && (
        <p className="flex items-start gap-2 rounded-xl border border-[#eed9a8] bg-warn-bg px-3.5 py-2.5 text-[12.5px] text-warn">
          <AlertTriangle className="mt-px size-4 shrink-0" aria-hidden />
          <span>
            Venta en persona: el efectivo queda <b>por entregar</b> a tu nombre
            hasta que lo entregues en el mostrador.
          </span>
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-xl bg-crit-bg px-3.5 py-2.5 text-[13px] font-semibold text-crit"
        >
          <AlertTriangle className="size-4" aria-hidden />
          {error}
        </p>
      )}

      <Barra
        etiqueta={
          formaEfectiva === "por_dosis" ? `Hoy (dosis 1 de ${pagos})` : "Total"
        }
        valor={formatoMoneda(hoy)}
      >
        <Button
          size="lg"
          className="h-12 px-5 text-[15px]"
          disabled={
            cobrando || (metodo === "efectivo" && recibido > 0 && cambio < 0)
          }
          onClick={cobrar}
        >
          {cobrando && <Loader2 className="animate-spin" aria-hidden />}
          {esRed ? "Registrar venta" : `Cobrar ${formatoMoneda(hoy)}`}
        </Button>
      </Barra>
    </>
  );
}

/* ───────────── Listo ───────────── */

function Listo({
  venta,
  canal,
  onNueva,
}: {
  venta: VentaRegistrada;
  canal: Canal;
  onNueva: () => void;
}) {
  const [dosisAplicada, setDosisAplicada] = useState(false);
  const [aplicando, iniciar] = useTransition();
  const mensaje = `Hola ${venta.cliente.nombre.split(" ")[0]}, gracias por tu compra en Peptique (${venta.folio}). Te compartimos el COA del lote ${venta.productos.map((p) => `${p.lote} (${p.nombre})`).join(", ")}${venta.productos.some((p) => p.tieneProtocolo) ? " y tu protocolo" : ""}.`;

  return (
    <>
      <div className="mt-4 flex flex-col items-center gap-2 text-center">
        <span className="inline-flex size-[72px] items-center justify-center rounded-full bg-ok-bg text-ok">
          <Check className="size-9" strokeWidth={2.6} aria-hidden />
        </span>
        <h1 className="text-[26px] font-medium" role="status">
          Venta registrada
        </h1>
        <span className="text-[13px] text-muted-foreground">
          {venta.folio} · {formatoMoneda(venta.cobrado)} ·{" "}
          {venta.cliente.nombre}
        </span>
      </div>
      {venta.cambio > 0 && (
        <div className="flex items-center gap-3 rounded-2xl bg-ok-bg px-4 py-3.5 text-ok">
          <b className="flex-1">Su cambio</b>
          <b className="num text-[26px]">
            {formatoMonedaCentavos(venta.cambio)}
          </b>
        </div>
      )}
      <ul className="flex flex-col divide-y rounded-2xl border bg-card">
        {[
          venta.dosis
            ? `Plan por dosis: dosis 1 de ${venta.dosis.de} pagada`
            : "Pagada y entregada",
          "Inventario actualizado",
          canal === "en_persona"
            ? "Efectivo por entregar a tu nombre"
            : "En el corte de caja",
        ].map((t) => (
          <li
            key={t}
            className="flex items-center gap-2.5 px-3.5 py-3 text-[14px]"
          >
            <Check className="size-4 text-ok" strokeWidth={2.4} aria-hidden />
            {t}
          </li>
        ))}
      </ul>
      <Button variant="outline" size="lg" className="h-12 text-[15px]" asChild>
        <a
          href={ligaWhatsapp(venta.cliente.whatsapp, mensaje)}
          target="_blank"
          rel="noopener noreferrer"
        >
          <MessageCircle aria-hidden />
          Mandar COA y protocolo
        </a>
      </Button>
      {venta.dosis && (
        <Button
          size="lg"
          className="h-12 text-[15px]"
          disabled={dosisAplicada || aplicando}
          onClick={() =>
            iniciar(async () => {
              const r = await aplicarDosisMostrador(venta.ventaId, 1);
              if (r.error) toast.error(r.error);
              else {
                setDosisAplicada(true);
                toast.success("Dosis 1 aplicada");
              }
            })
          }
        >
          {aplicando && <Loader2 className="animate-spin" aria-hidden />}
          {dosisAplicada ? "Dosis 1 aplicada" : "Aplicar dosis 1"}
        </Button>
      )}
      <Button
        variant={venta.dosis ? "ghost" : "default"}
        size="lg"
        className="h-12 text-[15px]"
        onClick={onNueva}
      >
        Nueva venta
      </Button>
    </>
  );
}

/* ───────────── Red: esperando el pago ───────────── */

const fechaHora = new Intl.DateTimeFormat("es-MX", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "America/Monterrey",
});

function EsperandoPago({
  venta,
  datosPago,
  onNueva,
}: {
  venta: VentaRegistrada;
  datosPago: string | null;
  onNueva: () => void;
}) {
  const mensaje = `Hola ${venta.cliente.nombre.split(" ")[0]}, tu compra en Peptique (${venta.folio}) es de ${formatoMoneda(venta.total)}. ${datosPago ?? "Te comparto los datos de pago."} Por favor pon la referencia ${venta.referencia} en tu transferencia.`;
  const pasos = [
    {
      titulo: "Apartado en tránsito",
      detalle: "ya no cuenta como inventario disponible",
      hecho: true,
    },
    {
      titulo: "Pago reflejado",
      detalle: "te avisamos en Mis ventas",
      hecho: false,
    },
    { titulo: "Recoges tu producto", detalle: "con Peptique", hecho: false },
  ];
  return (
    <>
      <div className="mt-2 flex flex-col items-center gap-2 text-center">
        <span className="inline-flex size-16 items-center justify-center rounded-full bg-warn-bg text-warn">
          <Loader2 className="size-7" aria-hidden />
        </span>
        <h1 className="text-[24px] font-medium" role="status">
          Esperando que se refleje
        </h1>
        <span className="text-[13px] text-muted-foreground">
          {venta.folio} · {formatoMoneda(venta.total)} · {venta.cliente.nombre}
        </span>
      </div>
      <div className="flex items-center gap-3 rounded-2xl border bg-card px-4 py-3">
        <span className="flex-1 text-[13px] text-muted-foreground">
          Referencia para el cliente
        </span>
        <b className="font-mono text-[18px]">{venta.referencia}</b>
      </div>
      <ol className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
        {pasos.map((p, i) => (
          <li key={p.titulo} className="flex items-start gap-3">
            <span
              className={cn(
                "inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[12px] font-extrabold",
                p.hecho
                  ? "bg-chart-1 text-white"
                  : i === 1
                    ? "border-2 border-[#e8c77d] bg-card"
                    : "border-2 bg-card",
              )}
            >
              {p.hecho ? (
                <Check className="size-3.5" strokeWidth={3} aria-hidden />
              ) : (
                i + 1
              )}
            </span>
            <span>
              <b className="text-[14px]">{p.titulo}</b>
              <span className="block text-[12px] text-muted-foreground">
                {p.detalle}
              </span>
            </span>
          </li>
        ))}
      </ol>
      {venta.vence && (
        <p className="text-center text-[12px] text-muted-foreground">
          Si el pago no se refleja antes del{" "}
          {fechaHora.format(new Date(venta.vence))}, el apartado se libera.
        </p>
      )}
      <Button variant="outline" size="lg" className="h-12 text-[15px]" asChild>
        <a
          href={ligaWhatsapp(venta.cliente.whatsapp, mensaje)}
          target="_blank"
          rel="noopener noreferrer"
        >
          <MessageCircle aria-hidden />
          Mandar datos de pago al cliente
        </a>
      </Button>
      <Button size="lg" className="h-12 text-[15px]" onClick={onNueva}>
        Nueva venta
      </Button>
    </>
  );
}

/* ───────────── Piezas compartidas ───────────── */

function TarjetaCliente({
  cliente,
  onCambiar,
}: {
  cliente: ClienteMostrador;
  onCambiar: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-card px-3.5 py-2.5">
      <span className="inline-flex size-9 items-center justify-center rounded-full bg-[#dce6d8] text-[12px] font-extrabold">
        {iniciales(cliente.nombre)}
      </span>
      <div className="flex-1">
        <b className="text-[14px]">{cliente.nombre}</b>
        <span className="block text-[12px] text-muted-foreground">
          {cliente.tipo === "medico"
            ? "Médico"
            : cliente.tipo === "distribuidor"
              ? "Distribuidor"
              : "Paciente"}{" "}
          · waiver firmado
        </span>
      </div>
      <button
        type="button"
        onClick={onCambiar}
        className="text-[13px] font-semibold text-chart-1 hover:underline"
      >
        Cambiar
      </button>
    </div>
  );
}

function Barra({
  etiqueta,
  valor,
  children,
}: {
  etiqueta: string;
  valor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="sticky bottom-[var(--barra-abajo,76px)] z-[5] -mx-4 mt-auto flex items-center gap-3 border-t bg-card/95 px-4 py-3 backdrop-blur sm:bottom-[var(--barra-abajo-sm,92px)]">
      <div className="flex-1">
        <span className="block text-[12px] text-muted-foreground">
          {etiqueta}
        </span>
        <b className="num text-[19px]">{valor}</b>
      </div>
      {children}
    </div>
  );
}
