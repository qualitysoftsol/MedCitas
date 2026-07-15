import { createFileRoute } from "@tanstack/react-router";
import { useStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, Stethoscope, ClipboardList, FileCheck2, User } from "lucide-react";

export const Route = createFileRoute("/app/admin/")({
  component: AdminDashboard,
});

function AdminDashboard() {
  const { users, appointments, resultados } = useStore();
  const ips = users.filter((u) => u.role === "ips");
  const emps = users.filter((u) => u.role === "empresa");
  const parts = users.filter((u) => u.role === "particular");

  const stats = [
    { label: "IPS registradas", value: ips.length, icon: Stethoscope },
    { label: "Empresas registradas", value: emps.length, icon: Building2 },
    { label: "Particulares", value: parts.length, icon: User },
    { label: "Citas agendadas", value: appointments.length, icon: ClipboardList },
    { label: "Resultados cargados", value: resultados.length, icon: FileCheck2 },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-3xl font-bold text-primary">{s.value}</div>
                  <div className="text-sm text-muted-foreground">{s.label}</div>
                </div>
                <s.icon className="w-6 h-6 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>IPS</CardTitle></CardHeader>
          <CardContent>
            {ips.length === 0 ? <p className="text-sm text-muted-foreground">Sin IPS.</p> : (
              <ul className="divide-y">
                {ips.map((u) => (
                  <li key={u.id} className="py-2">
                    <div className="font-medium">{u.profile.nombre}</div>
                    <div className="text-xs text-muted-foreground">
                      @{u.usuario} · {u.ciudad}, {u.departamento}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {(u.departamentos ?? []).map((d) => <Badge key={d} variant="secondary" className="text-xs">{d}</Badge>)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Empresas</CardTitle></CardHeader>
          <CardContent>
            {emps.length === 0 ? <p className="text-sm text-muted-foreground">Sin empresas.</p> : (
              <ul className="divide-y">
                {emps.map((u) => (
                  <li key={u.id} className="py-2">
                    <div className="font-medium">{u.profile.nombre}</div>
                    <div className="text-xs text-muted-foreground">
                      @{u.usuario} {u.nit ? `· NIT ${u.nit}` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
