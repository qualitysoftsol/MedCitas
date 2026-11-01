import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import {
  Receipt, Eye, Loader2, RefreshCw, Upload, Undo2, Check, X, Clock, CheckCircle2, AlertTriangle, Ban, Hourglass,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/app/PageHeader";
import { EmptyState } from "@/components/app/EmptyState";
import { StatusPill } from "@/components/app/StatusBadge";
import { DescargarPdfButton, DetalleCitasDialog, EstadoCobroBadge } from "@/components/app/Facturacion";
import {
  periodoDeMes, useActualizarFactura, useActualizarLiquidacion, useFacturaItems, useFacturas, useGenerarFacturas,
  useGenerarLiquidaciones, useLiquidacionItems, useLiquidaciones, useSubirPdfFactura,
  type FacturaConEmpresa, type LiquidacionConIps,
} from "@/lib/hooks/useFacturacion";
import { useReembolsos, useResolverReembolso, type ReembolsoAdmin } from "@/lib/hooks/usePagos";
import type { Reembolso } from "@/lib/database.types";
import { formatFechaCorta, formatHora, formatMes, formatPesos, formatTimestamp, hoyISO } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/admin/facturacion")({
  component: AdminFacturacion,
});

/** Mes anterior en formato "YYYY-MM": lo normal es facturar el mes que acaba de cerrar. */
function mesAnterior() {
  const [y, m] = hoyISO().split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function AdminFacturacion() {
  const { data: reembolsos = [] } = useReembolsos();
  const porRevisar = reembolsos.filter((r) => r.estado === "solicitado" || r.estado === "fallido").length;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Receipt}
        title="Facturación"
        description="Facturas mensuales de empresas, pagos mensuales a las IPS y reembolsos de pagos en línea."
      />
      <Tabs defaultValue={porRevisar > 0 ? "reembolsos" : "empresas"}>
        <TabsList className="mb-4 flex-wrap">
          <TabsTrigger value="empresas">Facturas de empresas</TabsTrigger>
          <TabsTrigger value="ips">Pagos a IPS</TabsTrigger>
          <TabsTrigger value="reembolsos">
            Reembolsos
            {porRevisar > 0 && <span className="ml-1.5 rounded-full bg-warning px-1.5 text-xs font-semibold text-white tabular-nums">{porRevisar}</span>}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="empresas"><FacturasEmpresas /></TabsContent>
        <TabsContent value="ips"><PagosIps /></TabsContent>
        <TabsContent value="reembolsos"><Reembolsos items={reembolsos} /></TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Selector de mes + generar ────────────────────────────────────────────────

function BarraMes({
  mes, onMes, onGenerar, generando, textoBoton, resumen,
}: {
  mes: string;
  onMes: (m: string) => void;
  onGenerar: () => void;
  generando: boolean;
  textoBoton: string;
  resumen: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-end md:justify-between md:p-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label htmlFor="mes" className="text-[13px] font-semibold">Mes</label>
          <Input id="mes" type="month" value={mes} max={hoyISO().slice(0, 7)} onChange={(e) => e.target.value && onMes(e.target.value)} className="w-44" />
        </div>
        <Button onClick={onGenerar} disabled={generando}>
          {generando ? <Loader2 className="animate-spin" /> : <RefreshCw />} {textoBoton}
        </Button>
      </div>
      <div className="text-sm text-muted-foreground">{resumen}</div>
    </div>
  );
}

const Totales = ({ total, pagado }: { total: number; pagado: number }) => (
  <p className="flex flex-wrap gap-x-4 gap-y-1">
    <span>Total <strong className="text-foreground tabular-nums">{formatPesos(total)}</strong></span>
    <span>Pagado <strong className="text-success-foreground tabular-nums">{formatPesos(pagado)}</strong></span>
    <span>Pendiente <strong className="text-warning-foreground tabular-nums">{formatPesos(total - pagado)}</strong></span>
  </p>
);

function EstadoSelect({ value, onChange, disabled, label }: { value: "pendiente" | "pagada"; onChange: (v: "pendiente" | "pagada") => void; disabled?: boolean; label: string }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as "pendiente" | "pagada")} disabled={disabled}>
      <SelectTrigger className="h-9 w-36" aria-label={label}><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="pendiente">Pendiente</SelectItem>
        <SelectItem value="pagada">Pagada</SelectItem>
      </SelectContent>
    </Select>
  );
}

// ─── Facturas de empresas ─────────────────────────────────────────────────────

function FacturasEmpresas() {
  const [mes, setMes] = useState(mesAnterior);
  const periodo = periodoDeMes(mes);
  const { data: facturas = [], isLoading } = useFacturas(periodo);
  const generar = useGenerarFacturas();
  const actualizar = useActualizarFactura();
  const [detalle, setDetalle] = useState<FacturaConEmpresa | null>(null);
  const { data: items, isLoading: itemsLoading } = useFacturaItems(detalle?.id ?? null);

  const total = facturas.reduce((s, f) => s + f.total, 0);
  const pagado = facturas.filter((f) => f.estado === "pagada").reduce((s, f) => s + f.total, 0);

  const cambiar = (f: FacturaConEmpresa, cambios: Parameters<typeof actualizar.mutate>[0]["cambios"], ok: string) =>
    actualizar.mutate({ id: f.id, cambios }, { onSuccess: () => toast.success(ok), onError: () => toast.error("No se pudo guardar el cambio") });

  return (
    <Card className="overflow-hidden">
      <BarraMes
        mes={mes}
        onMes={setMes}
        generando={generar.isPending}
        textoBoton={facturas.length ? "Actualizar facturas" : "Generar facturas"}
        onGenerar={() => generar.mutate(periodo, {
          onSuccess: (n) => toast.success(n ? `${n} ${n === 1 ? "factura" : "facturas"} de ${formatMes(periodo).toLowerCase()}` : "No hay citas de empresas en este mes"),
          onError: () => toast.error("No se pudieron generar las facturas"),
        })}
        resumen={facturas.length > 0 && <Totales total={total} pagado={pagado} />}
      />
      <CardContent className="p-0 md:p-0">
        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground" role="status">Cargando…</p>
        ) : facturas.length === 0 ? (
          <EmptyState compact icon={Receipt} title={`Sin facturas de ${formatMes(periodo).toLowerCase()}`} description="Genera las facturas para crear una por cada empresa con citas agendadas o atendidas en el mes. Puedes volver a generarlas: las pagadas no cambian." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-surface hover:bg-surface">
                  <TableHead className="pl-5">Empresa</TableHead>
                  <TableHead className="text-right">Citas</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>N.º de factura</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="pr-5 text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {facturas.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="pl-5">
                      <div className="font-medium">{f.empresa?.nombre ?? "—"}</div>
                      {f.empresa?.nit && <div className="text-xs text-muted-foreground">NIT {f.empresa.nit}</div>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{f.num_citas}</TableCell>
                    <TableCell className="whitespace-nowrap text-right font-semibold tabular-nums">{formatPesos(f.total)}</TableCell>
                    <TableCell>
                      <Input
                        key={f.numero ?? ""}
                        defaultValue={f.numero ?? ""}
                        placeholder="Ej.: FE-1024"
                        aria-label={`Número de factura de ${f.empresa?.nombre ?? "la empresa"}`}
                        className="h-9 w-36"
                        onBlur={(e) => {
                          const numero = e.target.value.trim() || null;
                          if (numero !== f.numero) cambiar(f, { numero }, "Número de factura guardado");
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <EstadoSelect
                        value={f.estado}
                        label={`Estado de la factura de ${f.empresa?.nombre ?? "la empresa"}`}
                        disabled={actualizar.isPending}
                        onChange={(estado) => cambiar(f, { estado }, estado === "pagada" ? "Factura marcada como pagada" : "Factura marcada como pendiente")}
                      />
                    </TableCell>
                    <TableCell className="pr-5">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => setDetalle(f)}><Eye /> Citas</Button>
                        {f.pdf_path && <DescargarPdfButton ruta={f.pdf_path} />}
                        <SubirPdf factura={f} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
      <DetalleCitasDialog
        open={!!detalle}
        onOpenChange={(o) => !o && setDetalle(null)}
        titulo={detalle ? `${detalle.empresa?.nombre ?? "Empresa"} · ${formatMes(detalle.periodo)}` : ""}
        descripcion="Citas incluidas en la factura, con el valor que ve la empresa (incluye comisión)."
        items={items}
        loading={itemsLoading}
      />
    </Card>
  );
}

function SubirPdf({ factura }: { factura: FacturaConEmpresa }) {
  const subir = useSubirPdfFactura();
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="application/pdf"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const archivo = e.target.files?.[0];
          e.target.value = "";
          if (!archivo) return;
          if (archivo.type && archivo.type !== "application/pdf") return toast.error("El archivo debe ser un PDF");
          subir.mutate({ factura, archivo }, { onSuccess: () => toast.success("Factura cargada"), onError: () => toast.error("No se pudo cargar el PDF") });
        }}
      />
      <Button size="sm" variant="ghost" disabled={subir.isPending} onClick={() => input.current?.click()} aria-label={`${factura.pdf_path ? "Reemplazar" : "Cargar"} PDF de la factura de ${factura.empresa?.nombre ?? "la empresa"}`}>
        {subir.isPending ? <Loader2 className="animate-spin" /> : <Upload />} {factura.pdf_path ? "Reemplazar" : "Cargar PDF"}
      </Button>
    </>
  );
}

// ─── Pagos a IPS ──────────────────────────────────────────────────────────────

function PagosIps() {
  const [mes, setMes] = useState(mesAnterior);
  const periodo = periodoDeMes(mes);
  const { data: liquidaciones = [], isLoading } = useLiquidaciones(periodo);
  const generar = useGenerarLiquidaciones();
  const actualizar = useActualizarLiquidacion();
  const [detalle, setDetalle] = useState<LiquidacionConIps | null>(null);
  const { data: items, isLoading: itemsLoading } = useLiquidacionItems(detalle?.id ?? null);

  const total = liquidaciones.reduce((s, l) => s + l.total, 0);
  const pagado = liquidaciones.filter((l) => l.estado === "pagada").reduce((s, l) => s + l.total, 0);

  return (
    <Card className="overflow-hidden">
      <BarraMes
        mes={mes}
        onMes={setMes}
        generando={generar.isPending}
        textoBoton={liquidaciones.length ? "Actualizar pagos" : "Calcular pagos"}
        onGenerar={() => generar.mutate(periodo, {
          onSuccess: (n) => toast.success(n ? `${n} ${n === 1 ? "IPS" : "IPS"} con citas en ${formatMes(periodo).toLowerCase()}` : "No hay citas en este mes"),
          onError: () => toast.error("No se pudieron calcular los pagos"),
        })}
        resumen={liquidaciones.length > 0 && <Totales total={total} pagado={pagado} />}
      />
      <CardContent className="p-0 md:p-0">
        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground" role="status">Cargando…</p>
        ) : liquidaciones.length === 0 ? (
          <EmptyState compact icon={Receipt} title={`Sin pagos calculados para ${formatMes(periodo).toLowerCase()}`} description="Calcula lo que se le debe a cada IPS por todas sus citas agendadas o atendidas del mes, a su precio base (sin comisión)." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-surface hover:bg-surface">
                  <TableHead className="pl-5">IPS</TableHead>
                  <TableHead className="text-right">Citas</TableHead>
                  <TableHead className="text-right">A pagar</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="pr-5 text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {liquidaciones.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="pl-5">
                      <div className="font-medium">{l.ips?.nombre ?? "—"}</div>
                      {l.ips?.nit && <div className="text-xs text-muted-foreground">NIT {l.ips.nit}</div>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{l.num_citas}</TableCell>
                    <TableCell className="whitespace-nowrap text-right font-semibold tabular-nums">{formatPesos(l.total)}</TableCell>
                    <TableCell>
                      <EstadoSelect
                        value={l.estado}
                        label={`Estado del pago a ${l.ips?.nombre ?? "la IPS"}`}
                        disabled={actualizar.isPending}
                        onChange={(estado) => actualizar.mutate({ id: l.id, estado }, {
                          onSuccess: () => toast.success(estado === "pagada" ? "Pago marcado como hecho" : "Pago marcado como pendiente"),
                          onError: () => toast.error("No se pudo guardar el cambio"),
                        })}
                      />
                    </TableCell>
                    <TableCell className="pr-5 text-right">
                      <Button size="sm" variant="outline" onClick={() => setDetalle(l)}><Eye /> Citas</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
      <DetalleCitasDialog
        open={!!detalle}
        onOpenChange={(o) => !o && setDetalle(null)}
        titulo={detalle ? `${detalle.ips?.nombre ?? "IPS"} · ${formatMes(detalle.periodo)}` : ""}
        descripcion="Citas del mes a precio base de la IPS (sin comisión)."
        items={items}
        loading={itemsLoading}
        columnaIps={false}
      />
    </Card>
  );
}

// ─── Reembolsos ───────────────────────────────────────────────────────────────

const ESTADO_REEMBOLSO: Record<Reembolso["estado"], { label: string; tone: "warning" | "info" | "success" | "danger" | "neutral"; icon: React.ComponentType<{ className?: string }> }> = {
  solicitado: { label: "Por revisar", tone: "warning", icon: Clock },
  en_proceso: { label: "En proceso", tone: "info", icon: Hourglass },
  completado: { label: "Completado", tone: "success", icon: CheckCircle2 },
  fallido: { label: "Falló", tone: "danger", icon: AlertTriangle },
  denegado: { label: "Denegado", tone: "neutral", icon: Ban },
};

function Reembolsos({ items }: { items: ReembolsoAdmin[] }) {
  const [soloPendientes, setSoloPendientes] = useState(true);
  const [confirmar, setConfirmar] = useState<{ r: ReembolsoAdmin; accion: "aprobar" | "denegar" } | null>(null);
  const resolver = useResolverReembolso();
  const visibles = soloPendientes ? items.filter((r) => r.estado === "solicitado" || r.estado === "fallido") : items;

  const ejecutar = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!confirmar) return;
    resolver.mutate(
      { reembolso_id: confirmar.r.id, accion: confirmar.accion },
      {
        onSuccess: ({ estado }) => {
          toast.success(estado === "denegado" ? "Reembolso denegado" : estado === "completado" ? "Reembolso completado" : "Reembolso enviado a Rapyd");
          setConfirmar(null);
        },
        onError: (err) => { toast.error("No se pudo procesar el reembolso", { description: err.message }); setConfirmar(null); },
      },
    );
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-lg">Reembolsos de particulares</CardTitle>
          <CardDescription>Se crean al cancelar una cita pagada o si un pago llega cuando la reserva ya venció. Al aprobar, Rapyd devuelve el valor total.</CardDescription>
        </div>
        <div className="inline-flex shrink-0 rounded-lg border bg-card p-1" role="group" aria-label="Filtrar reembolsos">
          {[{ v: true, l: "Por revisar" }, { v: false, l: "Todos" }].map((o) => (
            <button
              key={o.l}
              aria-pressed={soloPendientes === o.v}
              onClick={() => setSoloPendientes(o.v)}
              className={cn("rounded-md px-3 py-1.5 text-sm font-medium", soloPendientes === o.v ? "bg-primary-soft text-accent-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {o.l}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="p-0 md:p-0">
        {visibles.length === 0 ? (
          <EmptyState compact icon={Undo2} title={soloPendientes ? "No hay reembolsos por revisar" : "Aún no hay reembolsos"} />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-surface hover:bg-surface">
                  <TableHead className="pl-5">Solicitado</TableHead>
                  <TableHead>Paciente</TableHead>
                  <TableHead>Cita</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="pr-5 text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibles.map((r) => {
                  const cita = r.pago?.cita;
                  const pendiente = r.estado === "solicitado" || r.estado === "fallido";
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap pl-5 text-sm">{formatTimestamp(r.created_at)}</TableCell>
                      <TableCell>
                        <div className="font-medium">{cita?.empleado_nombre ?? "—"}</div>
                        <div className="text-xs tabular-nums text-muted-foreground">{cita?.empleado_cedula}</div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {cita ? <>{formatFechaCorta(cita.fecha)}, {formatHora(cita.hora)}<div className="text-xs text-muted-foreground">{cita.servicio} · {cita.ips?.nombre}</div></> : "—"}
                      </TableCell>
                      <TableCell className="max-w-[16rem] text-sm">
                        {r.motivo}
                        {r.detalle && <div className="text-xs text-muted-foreground">{r.detalle}</div>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right font-semibold tabular-nums">{formatPesos(r.monto)}</TableCell>
                      <TableCell><StatusPill def={ESTADO_REEMBOLSO[r.estado]} /></TableCell>
                      <TableCell className="pr-5">
                        {pendiente && (
                          <div className="flex justify-end gap-2">
                            <Button size="sm" onClick={() => setConfirmar({ r, accion: "aprobar" })}>
                              <Check /> {r.estado === "fallido" ? "Reintentar" : "Aprobar"}
                            </Button>
                            {r.estado === "solicitado" && (
                              <Button size="sm" variant="ghost" className="text-danger-foreground hover:bg-danger-soft" onClick={() => setConfirmar({ r, accion: "denegar" })}>
                                <X /> Denegar
                              </Button>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <AlertDialog open={!!confirmar} onOpenChange={(o) => { if (!o && !resolver.isPending) setConfirmar(null); }}>
        <AlertDialogContent>
          {confirmar && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{confirmar.accion === "aprobar" ? "¿Aprobar el reembolso?" : "¿Denegar el reembolso?"}</AlertDialogTitle>
                <AlertDialogDescription>
                  {confirmar.accion === "aprobar"
                    ? <>Rapyd devolverá <strong className="text-foreground">{formatPesos(confirmar.r.monto)}</strong> a {confirmar.r.pago?.cita?.empleado_nombre ?? "el paciente"} por el mismo medio con que pagó. No se puede deshacer.</>
                    : <>El paciente no recibirá la devolución de {formatPesos(confirmar.r.monto)}. Usa esta opción solo si hay una razón para no reembolsar.</>}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={resolver.isPending}>Volver</AlertDialogCancel>
                <AlertDialogAction
                  onClick={ejecutar}
                  disabled={resolver.isPending}
                  className={cn(confirmar.accion === "denegar" && buttonVariants({ variant: "destructive" }))}
                >
                  {resolver.isPending ? <><Loader2 className="animate-spin" /> Procesando…</> : confirmar.accion === "aprobar" ? "Sí, reembolsar" : "Sí, denegar"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
