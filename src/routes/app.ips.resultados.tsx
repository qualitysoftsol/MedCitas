import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/app/ips/resultados")({
  component: IpsResultados,
});

function IpsResultados() {
  const { currentUser, appointments, resultados, addResultado } = useStore();
  const pendientes = appointments.filter((a) => a.ipsId === currentUser!.id && a.estado === "agendada");
  const atendidas = resultados.filter((r) => r.ipsId === currentUser!.id);

  const [open, setOpen] = useState(false);
  const [apptId, setApptId] = useState<string>("");
  const [diagnostico, setDiagnostico] = useState("");
  const [apto, setApto] = useState<"apto" | "apto_restricciones" | "no_apto">("apto");
  const [obs, setObs] = useState("");

  const submit = () => {
    const appt = appointments.find((a) => a.id === apptId);
    if (!appt) return toast.error("Selecciona una cita");
    if (!diagnostico.trim()) return toast.error("Diagnóstico requerido");
    addResultado({
      appointmentId: appt.id,
      empresaId: appt.empresaId,
      ipsId: appt.ipsId,
      empleadoNombre: appt.empleadoNombre,
      empleadoCedula: appt.empleadoCedula,
      fecha: new Date().toISOString().slice(0, 10),
      diagnostico,
      apto,
      observaciones: obs,
    });
    toast.success("Resultado cargado");
    setOpen(false); setApptId(""); setDiagnostico(""); setObs(""); setApto("apto");
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Citas pendientes de resultado</CardTitle>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button>Cargar resultado</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Nuevo resultado</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Cita</Label>
                    <Select value={apptId} onValueChange={setApptId}>
                      <SelectTrigger><SelectValue placeholder="Selecciona una cita" /></SelectTrigger>
                      <SelectContent>
                        {pendientes.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.fecha} {a.hora} · {a.empleadoNombre} ({a.empleadoCedula})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Diagnóstico</Label>
                    <Textarea value={diagnostico} onChange={(e) => setDiagnostico(e.target.value)} />
                  </div>
                  <div>
                    <Label>Aptitud</Label>
                    <Select value={apto} onValueChange={(v) => setApto(v as typeof apto)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="apto">Apto</SelectItem>
                        <SelectItem value="apto_restricciones">Apto con restricciones</SelectItem>
                        <SelectItem value="no_apto">No apto</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Observaciones</Label>
                    <Textarea value={obs} onChange={(e) => setObs(e.target.value)} />
                  </div>
                </div>
                <DialogFooter><Button onClick={submit}>Guardar</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {pendientes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay citas pendientes.</p>
          ) : (
            <ul className="divide-y">
              {pendientes.map((a) => (
                <li key={a.id} className="py-2 text-sm">
                  <b>{a.empleadoNombre}</b> · {a.fecha} {a.hora} · {a.departamentoMedico}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Resultados cargados</CardTitle></CardHeader>
        <CardContent>
          {atendidas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin resultados aún.</p>
          ) : (
            <ul className="divide-y">
              {atendidas.map((r) => (
                <li key={r.id} className="py-3">
                  <div className="font-medium">{r.empleadoNombre} · {r.empleadoCedula}</div>
                  <div className="text-xs text-muted-foreground">{r.fecha} — Aptitud: {r.apto.replace("_", " ")}</div>
                  <div className="text-sm mt-1">{r.diagnostico}</div>
                  {r.observaciones && <div className="text-xs text-muted-foreground mt-1">Obs: {r.observaciones}</div>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
