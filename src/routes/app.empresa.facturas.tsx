import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Receipt, Eye } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/app/PageHeader";
import { EmptyState, ErrorState } from "@/components/app/EmptyState";
import { DescargarPdfButton, DetalleCitasDialog, EstadoCobroBadge } from "@/components/app/Facturacion";
import { useFacturaItems, useFacturas, type FacturaConEmpresa } from "@/lib/hooks/useFacturacion";
import { formatMes, formatPesos } from "@/lib/format";

export const Route = createFileRoute("/app/empresa/facturas")({
  component: EmpresaFacturas,
});

function EmpresaFacturas() {
  const { data: facturas = [], isLoading, isError, refetch } = useFacturas();
  const [detalle, setDetalle] = useState<FacturaConEmpresa | null>(null);
  const { data: items, isLoading: itemsLoading } = useFacturaItems(detalle?.id ?? null);
  const pendiente = facturas.filter((f) => f.estado === "pendiente").reduce((s, f) => s + f.total, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Receipt}
        title="Facturas"
        description="Cobro mensual de las citas de tus empleados. El valor incluye todos los cargos."
        actions={pendiente > 0 ? (
          <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm font-medium text-warning-foreground">
            Pendiente por pagar: <span className="tabular-nums">{formatPesos(pendiente)}</span>
          </p>
        ) : undefined}
      />

      <Card>
        <CardContent className="p-0 md:p-0">
          {isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground" role="status">Cargando facturas…</p>
          ) : isError ? (
            <ErrorState title="No pudimos cargar tus facturas" onRetry={() => refetch()} />
          ) : facturas.length === 0 ? (
            <EmptyState icon={Receipt} title="Aún no tienes facturas" description="Al cierre de cada mes se genera la factura con las citas de tus empleados." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-surface hover:bg-surface">
                    <TableHead className="pl-5">Mes</TableHead>
                    <TableHead>N.º de factura</TableHead>
                    <TableHead className="text-right">Citas</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="pr-5 text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {facturas.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell className="pl-5 font-medium">{formatMes(f.periodo)}</TableCell>
                      <TableCell>{f.numero ?? <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="text-right tabular-nums">{f.num_citas}</TableCell>
                      <TableCell className="whitespace-nowrap text-right font-semibold tabular-nums">{formatPesos(f.total)}</TableCell>
                      <TableCell><EstadoCobroBadge estado={f.estado} /></TableCell>
                      <TableCell className="pr-5">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => setDetalle(f)}><Eye /> Ver citas</Button>
                          {f.pdf_path && <DescargarPdfButton ruta={f.pdf_path} label="Factura" />}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <DetalleCitasDialog
        open={!!detalle}
        onOpenChange={(o) => !o && setDetalle(null)}
        titulo={detalle ? `Factura de ${formatMes(detalle.periodo).toLowerCase()}` : ""}
        descripcion="Citas incluidas en esta factura."
        items={items}
        loading={itemsLoading}
      />
    </div>
  );
}
