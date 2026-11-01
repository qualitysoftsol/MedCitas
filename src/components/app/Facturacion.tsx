import { CheckCircle2, Clock, FileDown, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusPill } from "./StatusBadge";
import { abrirPdfFactura, type ItemCita } from "@/lib/hooks/useFacturacion";
import { capitalizar, formatFechaCorta, formatHora, formatPesos } from "@/lib/format";

// Piezas compartidas por "Facturas" (empresa) y "Facturación" (admin).

const ESTADO_COBRO = {
  pendiente: { label: "Pendiente", tone: "warning" as const, icon: Clock },
  pagada: { label: "Pagada", tone: "success" as const, icon: CheckCircle2 },
};

export function EstadoCobroBadge({ estado }: { estado: "pendiente" | "pagada" }) {
  return <StatusPill def={ESTADO_COBRO[estado]} />;
}

export function DescargarPdfButton({ ruta, label = "PDF" }: { ruta: string; label?: string }) {
  const [abriendo, setAbriendo] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={abriendo}
      onClick={async () => {
        setAbriendo(true);
        try { await abrirPdfFactura(ruta); } catch { toast.error("No se pudo abrir el PDF"); } finally { setAbriendo(false); }
      }}
    >
      {abriendo ? <Loader2 className="animate-spin" /> : <FileDown />} {label}
    </Button>
  );
}

/** Detalle de las citas de una factura o de un pago a IPS. */
export function DetalleCitasDialog({
  open, onOpenChange, titulo, descripcion, items, loading, columnaIps = true, columnaEmpleado = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  titulo: string;
  descripcion: string;
  items: ItemCita[] | undefined;
  loading: boolean;
  columnaIps?: boolean;
  columnaEmpleado?: boolean;
}) {
  const total = (items ?? []).reduce((s, i) => s + i.valor, 0);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descripcion}</DialogDescription>
        </DialogHeader>
        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground" role="status">Cargando citas…</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow className="bg-surface hover:bg-surface">
                  <TableHead>Fecha</TableHead>
                  {columnaEmpleado && <TableHead>Paciente</TableHead>}
                  <TableHead>Examen</TableHead>
                  {columnaIps && <TableHead>IPS</TableHead>}
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(items ?? []).map((i) => (
                  <TableRow key={i.appointment_id}>
                    <TableCell className="whitespace-nowrap">
                      {i.cita ? `${formatFechaCorta(i.cita.fecha)}, ${formatHora(i.cita.hora)}` : "—"}
                    </TableCell>
                    {columnaEmpleado && (
                      <TableCell>
                        <div className="font-medium">{i.cita?.empleado_nombre}</div>
                        <div className="text-xs tabular-nums text-muted-foreground">{i.cita?.empleado_cedula}</div>
                      </TableCell>
                    )}
                    <TableCell>
                      <div>{capitalizar(i.cita?.tipo_examen)}</div>
                      <div className="text-xs text-muted-foreground">{i.cita?.servicio}</div>
                    </TableCell>
                    {columnaIps && <TableCell>{i.cita?.ips?.nombre ?? "—"}</TableCell>}
                    <TableCell className="whitespace-nowrap text-right tabular-nums">{formatPesos(i.valor)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={1 + (columnaEmpleado ? 1 : 0) + 1 + (columnaIps ? 1 : 0)} className="font-semibold">
                    Total · {items?.length ?? 0} {items?.length === 1 ? "cita" : "citas"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-semibold tabular-nums">{formatPesos(total)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
