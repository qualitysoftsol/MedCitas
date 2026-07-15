import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays, ClipboardList, FileUp, MapPin, FilePlus2, UserCircle } from "lucide-react";

export const Route = createFileRoute("/app/admin/menus")({
  component: AdminMenus,
});

const IPS_MENU = [
  { icon: CalendarDays, title: "Calendario", desc: "Registrar horarios disponibles por departamento y ciudad" },
  { icon: ClipboardList, title: "Citas agendadas", desc: "Ver citas solicitadas por las empresas" },
  { icon: FileUp, title: "Cargar resultados", desc: "Subir el resultado del examen por persona atendida" },
  { icon: UserCircle, title: "Mi perfil", desc: "Editar datos y contraseña" },
];

const EMPRESA_MENU = [
  { icon: MapPin, title: "Solicitar cita", desc: "Elegir IPS cercana en mapa y agendar examen" },
  { icon: ClipboardList, title: "Mis citas", desc: "Resumen de citas de empleados o próximos empleados" },
  { icon: FilePlus2, title: "Resultados", desc: "Consultar resultados de los exámenes" },
  { icon: UserCircle, title: "Mi perfil", desc: "Editar datos y contraseña" },
];

const PARTICULAR_MENU = [
  { icon: MapPin, title: "Solicitar cita", desc: "Agendar examen médico para sí mismo en la IPS más cercana" },
  { icon: ClipboardList, title: "Mis citas", desc: "Ver el estado de sus propias citas" },
  { icon: FilePlus2, title: "Mis resultados", desc: "Consultar sus resultados médicos" },
  { icon: UserCircle, title: "Mi perfil", desc: "Editar datos y contraseña" },
];

function AdminMenus() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {[
        { titulo: "Menú de IPS", items: IPS_MENU },
        { titulo: "Menú de Empresa", items: EMPRESA_MENU },
        { titulo: "Menú de Particular", items: PARTICULAR_MENU },
      ].map((g) => (
        <Card key={g.titulo}>
          <CardHeader><CardTitle>{g.titulo}</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {g.items.map((it) => (
                <li key={it.title} className="flex gap-3 items-start">
                  <div className="rounded-md p-2 bg-accent"><it.icon className="w-4 h-4 text-accent-foreground" /></div>
                  <div>
                    <div className="font-medium">{it.title}</div>
                    <div className="text-xs text-muted-foreground">{it.desc}</div>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
