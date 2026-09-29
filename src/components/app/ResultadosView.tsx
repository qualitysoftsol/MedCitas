import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  FileText, Download, Eye, CalendarDays, Building2, Hourglass, FileCheck2, Loader2, UserRound, SearchX, FileWarning, Stethoscope,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { useAppointments } from "@/lib/hooks/useAppointments";
import { useResultados, getResultadoPdfUrl, type ResultadoConDetalle } from "@/lib/hooks/useResultados";
import { Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "./PageHeader";
import { AptoBadge, ResultadoStatusBadge } from "./StatusBadge";
import { EmptyState, ErrorState } from "./EmptyState";
import { construirResultados, type ResultadoItem } from "@/lib/resultados";
import { capitalizar, formatFecha } from "@/lib/format";
import { cn } from "@/lib/utils";

type EstadoFiltro = "todos" | "disponible" | "procesamiento";

interface Props {
  title: string;
  description: string;
  /** Empresa: muestra a qué empleado corresponde cada resultado. */
  mostrarEmpleado?: boolean;
  citasHref: "/app/particular/citas" | "/app/empresa/citas";
}

function nombreArchivo(item: ResultadoItem) {
  const base = `resultado-${item.servicio}-${item.fecha}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return `${base.replace(/[^a-z0-9-]+/g, "-")}.pdf`;
}

/** Abre o descarga el PDF firmado. La pestaña se abre antes del await para evitar el bloqueo de ventanas emergentes. */
function usePdfActions() {
  const [busy, setBusy] = useState<string | null>(null);

  const ver = async (item: ResultadoItem) => {
    const path = item.resultado?.pdf_url;
    if (!path) return;
    const win = window.open("", "_blank");
    setBusy(`ver-${item.id}`);
    try {
      const url = await getResultadoPdfUrl(path);
      if (win) win.location.href = url; else window.location.href = url;
    } catch {
      win?.close();
      toast.error("No pudimos abrir el resultado", { description: "Inténtalo de nuevo. Si el problema continúa, contacta a la IPS." });
    } finally {
      setBusy(null);
    }
  };

  const descargar = async (item: ResultadoItem) => {
    const path = item.resultado?.pdf_url;
    if (!path) return;
    setBusy(`dl-${item.id}`);
    try {
      const url = await getResultadoPdfUrl(path, nombreArchivo(item));
      const a = document.createElement("a");
      a.href = url;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success("Descarga iniciada");
    } catch {
      toast.error("No pudimos descargar el resultado", { description: "Revisa tu conexión e inténtalo de nuevo." });
    } finally {
      setBusy(null);
    }
  };

  return { ver, descargar, busy };
}

export function ResultadosView({ title, description, mostrarEmpleado, citasHref }: Props) {
  const { profile } = useAuth();
  const resultadosQ = useResultados(profile?.id, profile?.role);
  const citasQ = useAppointments(profile?.id, profile?.role);
  const [servicio, setServicio] = useState<string>("Todos");
  const [estado, setEstado] = useState<EstadoFiltro>("todos");
  const [abierto, setAbierto] = useState<ResultadoItem | null>(null);
  const pdf = usePdfActions();

  const items = useMemo(
    () => construirResultados(resultadosQ.data ?? [], citasQ.data ?? []),
    [resultadosQ.data, citasQ.data],
  );
  // Filtros por servicio generados a partir de los datos reales del usuario.
  const servicios = useMemo(() => ["Todos", ...Array.from(new Set(items.map((i) => i.servicio))).sort()], [items]);
  const filtrados = items.filter(
    (i) => (servicio === "Todos" || i.servicio === servicio) && (estado === "todos" || i.estado === estado),
  );
  const disponibles = items.filter((i) => i.estado === "disponible").length;
  const enProceso = items.length - disponibles;

  const loading = resultadosQ.isLoading || citasQ.isLoading;
  const error = resultadosQ.isError || citasQ.isError;

  return (
    <div className="space-y-6">
      <PageHeader icon={FileText} title={title} description={description} />

      {!loading && !error && items.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm" aria-live="polite">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1.5 font-medium text-success-foreground">
            <FileCheck2 className="size-4" aria-hidden /> {disponibles} {disponibles === 1 ? "disponible" : "disponibles"}
          </span>
          {enProceso > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-3 py-1.5 font-medium text-warning-foreground">
              <Hourglass className="size-4" aria-hidden /> {enProceso} en procesamiento
            </span>
          )}
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" role="status" aria-label="Cargando resultados">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="space-y-3 p-5">
              <div className="flex gap-3"><Skeleton className="size-11 rounded-xl" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/3" /></div></div>
              <Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-4/5" /><Skeleton className="h-9 w-full" />
            </Card>
          ))}
        </div>
      ) : error ? (
        <Card>
          <ErrorState
            title="No pudimos cargar tus resultados"
            onRetry={() => { void resultadosQ.refetch(); void citasQ.refetch(); }}
          />
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={FileText}
            title="Aún no tienes resultados disponibles"
            description="Cuando la IPS cargue el resultado de un examen lo verás aquí y te enviaremos una notificación."
            action={<Link to={citasHref} className={buttonVariants({ variant: "outline" })}><CalendarDays /> Ver mis citas</Link>}
          />
        </Card>
      ) : (
        <>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div role="group" aria-label="Filtrar por servicio" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {servicios.map((s) => (
                <button
                  key={s}
                  aria-pressed={servicio === s}
                  onClick={() => setServicio(s)}
                  className={cn(
                    "h-9 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    servicio === s
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card hover:border-primary/40 hover:bg-muted",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
            <div role="group" aria-label="Filtrar por estado" className="inline-flex shrink-0 rounded-lg border bg-card p-1">
              {([["todos", "Todos"], ["disponible", "Disponibles"], ["procesamiento", "En proceso"]] as const).map(([id, label]) => (
                <button
                  key={id}
                  aria-pressed={estado === id}
                  onClick={() => setEstado(id)}
                  className={cn(
                    "h-8 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    estado === id ? "bg-primary-soft text-accent-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {filtrados.length === 0 ? (
            <Card>
              <EmptyState
                compact
                icon={SearchX}
                title="No hay resultados con estos filtros"
                action={<Button variant="outline" onClick={() => { setServicio("Todos"); setEstado("todos"); }}>Ver todos</Button>}
              />
            </Card>
          ) : (
            <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filtrados.map((item) => (
                <li key={item.id}>
                  <ResultadoCard
                    item={item}
                    mostrarEmpleado={mostrarEmpleado}
                    busy={pdf.busy}
                    onVer={() => setAbierto(item)}
                    onDescargar={() => pdf.descargar(item)}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <ResultadoDialog
        item={abierto}
        mostrarEmpleado={mostrarEmpleado}
        busy={pdf.busy}
        onOpenChange={(o) => !o && setAbierto(null)}
        onVerPdf={pdf.ver}
        onDescargar={pdf.descargar}
      />
    </div>
  );
}

function ResultadoCard({
  item, mostrarEmpleado, busy, onVer, onDescargar,
}: {
  item: ResultadoItem;
  mostrarEmpleado?: boolean;
  busy: string | null;
  onVer: () => void;
  onDescargar: () => void;
}) {
  const disponible = item.estado === "disponible";
  const tienePdf = !!item.resultado?.pdf_url;
  return (
    <Card className={cn("flex h-full flex-col p-5 transition-shadow", disponible && "hover:shadow-md")}>
      <div className="flex items-start gap-3">
        <div className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-xl",
          disponible ? "bg-success-soft text-success-foreground" : "bg-warning-soft text-warning-foreground",
        )}>
          {disponible ? <FileCheck2 className="size-5" aria-hidden /> : <Hourglass className="size-5" aria-hidden />}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold leading-snug">{item.servicio}</h3>
          {item.tipoExamen && <p className="text-sm text-muted-foreground">Examen de {item.tipoExamen.toLowerCase()}</p>}
        </div>
      </div>

      <dl className="mt-4 space-y-1.5 text-sm">
        <div className="flex items-center gap-2"><CalendarDays className="size-4 text-muted-foreground" aria-hidden /><dt className="sr-only">Fecha</dt><dd>{formatFecha(item.fecha)}</dd></div>
        <div className="flex items-start gap-2"><Building2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden /><dt className="sr-only">IPS</dt><dd className="min-w-0">{item.ipsNombre}</dd></div>
        {mostrarEmpleado && (
          <div className="flex items-center gap-2"><UserRound className="size-4 text-muted-foreground" aria-hidden /><dt className="sr-only">Empleado</dt><dd>{item.empleadoNombre} · {item.empleadoCedula}</dd></div>
        )}
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <ResultadoStatusBadge estado={item.estado} />
        {item.resultado && <AptoBadge apto={item.resultado.apto} />}
      </div>

      <div className="mt-auto pt-4">
        {disponible ? (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={onVer}><Eye /> Ver resultado</Button>
            <Button onClick={onDescargar} disabled={!tienePdf || busy === `dl-${item.id}`} title={tienePdf ? undefined : "Este resultado no tiene PDF adjunto"}>
              {busy === `dl-${item.id}` ? <Loader2 className="animate-spin" /> : <Download />} Descargar
            </Button>
          </div>
        ) : (
          <p className="rounded-lg bg-muted px-3 py-2 text-[13px] text-muted-foreground">
            La IPS está preparando tu resultado. Te avisaremos cuando esté disponible.
          </p>
        )}
      </div>
    </Card>
  );
}

function ResultadoDialog({
  item, mostrarEmpleado, busy, onOpenChange, onVerPdf, onDescargar,
}: {
  item: ResultadoItem | null;
  mostrarEmpleado?: boolean;
  busy: string | null;
  onOpenChange: (o: boolean) => void;
  onVerPdf: (i: ResultadoItem) => void;
  onDescargar: (i: ResultadoItem) => void;
}) {
  const r: ResultadoConDetalle | null = item?.resultado ?? null;
  return (
    <Dialog open={!!item && !!r} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {item && r && (
          <>
            <DialogHeader className="text-left">
              <div className="flex flex-wrap gap-2"><ResultadoStatusBadge estado="disponible" /><AptoBadge apto={r.apto} /></div>
              <DialogTitle className="pt-1 text-xl">{item.servicio}</DialogTitle>
              <DialogDescription>
                {item.tipoExamen ? `Examen de ${item.tipoExamen.toLowerCase()} · ` : ""}{capitalizar(formatFecha(item.fecha))}
              </DialogDescription>
            </DialogHeader>

            <dl className="space-y-4 rounded-xl border bg-surface p-4 text-sm">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">IPS</dt>
                  <dd className="mt-0.5 flex items-start gap-1.5 font-medium"><Building2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />{item.ipsNombre}</dd>
                </div>
                {mostrarEmpleado ? (
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Empleado</dt>
                    <dd className="mt-0.5 font-medium">{item.empleadoNombre} · {item.empleadoCedula}</dd>
                  </div>
                ) : (
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Servicio</dt>
                    <dd className="mt-0.5 flex items-center gap-1.5 font-medium"><Stethoscope className="size-4 text-muted-foreground" aria-hidden />{item.servicio}</dd>
                  </div>
                )}
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Diagnóstico</dt>
                <dd className="mt-1 whitespace-pre-line leading-relaxed">{r.diagnostico || "—"}</dd>
              </div>
              {r.observaciones && (
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Observaciones</dt>
                  <dd className="mt-1 whitespace-pre-line leading-relaxed">{r.observaciones}</dd>
                </div>
              )}
            </dl>

            {!r.pdf_url && (
              <p className="flex items-center gap-2 rounded-lg bg-warning-soft px-3 py-2 text-[13px] text-warning-foreground">
                <FileWarning className="size-4 shrink-0" aria-hidden /> La IPS no adjuntó un documento PDF a este resultado.
              </p>
            )}

            <DialogFooter className="gap-2">
              <Button variant="outline" disabled={!r.pdf_url || busy === `ver-${item.id}`} onClick={() => onVerPdf(item)}>
                {busy === `ver-${item.id}` ? <Loader2 className="animate-spin" /> : <Eye />} Abrir PDF
              </Button>
              <Button disabled={!r.pdf_url || busy === `dl-${item.id}`} onClick={() => onDescargar(item)}>
                {busy === `dl-${item.id}` ? <Loader2 className="animate-spin" /> : <Download />} Descargar
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
