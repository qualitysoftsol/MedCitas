import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { DEPARTAMENTOS } from "@/lib/colombia";
import { useSlots, useAddSlots } from "@/lib/hooks/useSlots";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/app/ips/calendario")({
  component: IpsCalendario,
});

function IpsCalendario() {
  const { profile } = useAuth();
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [depMed, setDepMed] = useState(profile?.servicios?.[0] ?? "Medicina General");
  const [depto, setDepto] = useState(profile?.departamento ?? "");
  const [ciudad, setCiudad] = useState(profile?.ciudad ?? "");
  const [horas, setHoras] = useState("08:00, 09:00, 10:00, 14:00, 15:00");

  const { data: slots = [] } = useSlots(profile?.id);
  const addSlots = useAddSlots();

  const ciudades = DEPARTAMENTOS.find((d) => d.nombre === depto)?.ciudades ?? [];
  const selectedDate = date?.toISOString().slice(0, 10);
  const misSlots = slots.filter((s) => !selectedDate || s.fecha === selectedDate);

  const handleAdd = () => {
    if (!date) return toast.error("Selecciona una fecha");
    if (!ciudad || !depto) return toast.error("Selecciona departamento y ciudad");
    const fecha = date.toISOString().slice(0, 10);
    const lista = horas.split(",").map((h) => h.trim()).filter(Boolean);
    addSlots.mutate(
      lista.map((h) => ({
        ips_id: profile!.id,
        fecha,
        hora: h,
        servicio: depMed,
        ciudad,
      })),
      {
        onSuccess: () => toast.success(`${lista.length} horarios agregados`),
        onError: (err: unknown) => toast.error((err as Error).message),
      }
    );
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Registrar disponibilidad</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md border p-2 pointer-events-auto">
            <Calendar mode="single" selected={date} onSelect={setDate} className="mx-auto pointer-events-auto" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Departamento</Label>
              <Select value={depto} onValueChange={(v) => { setDepto(v); setCiudad(""); }}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {DEPARTAMENTOS.map((d) => <SelectItem key={d.nombre} value={d.nombre}>{d.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Ciudad</Label>
              <Select value={ciudad} onValueChange={setCiudad} disabled={!depto}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {ciudades.map((c) => <SelectItem key={c.nombre} value={c.nombre}>{c.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Servicio</Label>
            <Select value={depMed} onValueChange={setDepMed}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(profile?.servicios ?? ["Medicina General"]).map((d) => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Horas (separadas por coma)</Label>
            <Input value={horas} onChange={(e) => setHoras(e.target.value)} />
          </div>
          <Button onClick={handleAdd} disabled={addSlots.isPending} className="w-full">
            {addSlots.isPending ? "Guardando..." : "Agregar horarios"}
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Horarios {date ? `del ${date.toLocaleDateString("es-CO")}` : ""}</CardTitle>
        </CardHeader>
        <CardContent>
          {misSlots.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin horarios en esta fecha.</p>
          ) : (
            <ul className="divide-y">
              {misSlots.sort((a, b) => a.hora.localeCompare(b.hora)).map((s) => (
                <li key={s.id} className="py-2 flex items-center justify-between">
                  <div>
                    <div className="font-medium">{s.hora} · {s.servicio}</div>
                    <div className="text-xs text-muted-foreground">{s.ciudad}</div>
                  </div>
                  <Badge variant={s.taken ? "secondary" : "default"}>
                    {s.taken ? "Ocupado" : "Disponible"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
