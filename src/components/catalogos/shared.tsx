import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

/** Tarjeta de cada pestaña: título, descripción, acción principal y tabla sin márgenes. */
export function CatalogoCard({ title, description, action, children }: { title: string; description: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="text-lg">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        {action}
      </CardHeader>
      <CardContent className="p-0 md:p-0">{children}</CardContent>
    </Card>
  );
}

export function ConfirmarEliminar({
  abierto, titulo, children, pendiente, onConfirmar, onCerrar,
}: {
  abierto: boolean;
  titulo: string;
  children: ReactNode;
  pendiente: boolean;
  onConfirmar: () => void;
  onCerrar: () => void;
}) {
  return (
    <AlertDialog open={abierto} onOpenChange={(o) => { if (!o && !pendiente) onCerrar(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">{children}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pendiente}>Volver</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); onConfirmar(); }}
            disabled={pendiente}
            className={cn(buttonVariants({ variant: "destructive" }))}
          >
            {pendiente ? <><Loader2 className="animate-spin" /> Eliminando…</> : "Sí, eliminar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Colores de las etiquetas de línea, asignados por orden alfabético de la línea.
const COLORES_LINEA = [
  "bg-primary-soft text-accent-foreground",
  "bg-info-soft text-info-foreground",
  "bg-warning-soft text-warning-foreground",
  "bg-success-soft text-success-foreground",
];

export function LineaTag({ nombre, indice, activa }: { nombre: string; indice: number; activa: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        activa ? COLORES_LINEA[indice % COLORES_LINEA.length] : "bg-muted text-muted-foreground line-through",
      )}
      title={activa ? undefined : "Línea inactiva"}
    >
      {nombre}
    </span>
  );
}
