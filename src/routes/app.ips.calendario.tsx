import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useStore, DEPARTAMENTOS } from "@/lib/store";
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
  const { currentUser, slots, addSlots } = useStore();
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [depMed, setDepMed] = useState(currentUser?.departamentos?.[0] ?? "Medicina General");
  const [depto, setDepto] = useState(currentUser?.departamento ?? "");
  const [ciudad, setCiudad] = useState(currentUser?.ciudad ?? "");
  const [horas, setHoras] = useState("08:00, 09:00, 10:00, 14:00, 15:00");

  const ciudades = DEPARTAMENTOS.find((d) => d.nombre === depto)?.ciudades ?? [];

  const misSlots = slots.filter(
    (s) => s.ipsId === currentUser!.id && (!date || s.fecha === date.toISOString().slice(0, 10)),
  );

  const handleAdd = () => {
    if (!date) return toast.error("Selecciona una fecha");
    if (!ciudad || !depto) return toast.error("Selecciona departamento y ciudad");
    const fecha = date.toISOString().slice(0, 10);
    const lista = horas.split(",").map((h) => h.trim()).filter(Boolean);
    addSlots(
      lista.map((h) => ({
        ipsId: currentUser!.id,
        fecha,
        hora: h,
        departamentoMedico: depMed,
        ciudad,
      })),
    );
    toast.success(`${lista.length} horarios agregados`);
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
            <Label>Departamento médico</Label>
            <Select value={depMed} onValueChange={setDepMed}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(currentUser?.departamentos ?? ["Medicina General"]).map((d) => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Horas (separadas por coma)</Label>
            <Input value={horas} onChange={(e) => setHoras(e.target.value)} />
          </div>
          <Button onClick={handleAdd} className="w-full">Agregar horarios</Button>
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
                    <div className="font-medium">{s.hora} · {s.departamentoMedico}</div>
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
