import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/database.types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, Stethoscope, ClipboardList, FileCheck2, User } from "lucide-react";
import { IpsFotosSection } from "@/components/IpsFotosSection";

export const Route = createFileRoute("/app/admin/")({
  component: AdminDashboard,
});

function AdminDashboard() {
  useAuth(); // ensure auth context is available

  const { data: users = [] } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*')
      if (error) throw error
      return data as Profile[]
    },
  });

  const { data: appointments = [] } = useQuery({
    queryKey: ['admin', 'appointments'],
    queryFn: async () => {
      const { data, error } = await supabase.from('appointments').select('id')
      if (error) throw error
      return data
    },
  });

  const { data: resultados = [] } = useQuery({
    queryKey: ['admin', 'resultados'],
    queryFn: async () => {
      const { data, error } = await supabase.from('resultados').select('id')
      if (error) throw error
      return data
    },
  });

  const ips = users.filter((u) => u.role === 'ips');
  const emps = users.filter((u) => u.role === 'empresa');
  const parts = users.filter((u) => u.role === 'particular');

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
                    <div className="font-medium">{u.nombre}</div>
                    <div className="text-xs text-muted-foreground">
                      {u.ciudad}, {u.departamento}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {(u.departamentos_medicos ?? []).map((d) => <Badge key={d} variant="secondary" className="text-xs">{d}</Badge>)}
                    </div>
                    {(u.clasificaciones ?? []).length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {u.clasificaciones!.map((c) => <Badge key={c} variant="outline" className="text-xs">{c}</Badge>)}
                      </div>
                    )}
                    <div className="mt-3">
                      <IpsFotosSection ipsId={u.id} />
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
                    <div className="font-medium">{u.nombre}</div>
                    <div className="text-xs text-muted-foreground">
                      {u.nit ? `NIT ${u.nit}` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader><CardTitle>Particulares</CardTitle></CardHeader>
          <CardContent>
            {parts.length === 0 ? <p className="text-sm text-muted-foreground">Sin particulares.</p> : (
              <ul className="divide-y">
                {parts.map((u) => (
                  <li key={u.id} className="py-2">
                    <div className="font-medium">{u.nombre}</div>
                    <div className="text-xs text-muted-foreground">
                      {u.cedula ? `CC ${u.cedula}` : ""}
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
