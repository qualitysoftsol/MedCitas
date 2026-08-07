import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useAppointments } from "@/lib/hooks/useAppointments";
import { useResultados, useAddResultado, useResultadoPdfUrl } from "@/lib/hooks/useResultados";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import type { Resultado } from "@/lib/database.types";

export const Route = createFileRoute("/app/ips/resultados")({
  component: IpsResultados,
});

function ResultadoPdfLink({ path }: { path: string }) {
  const { data: signedUrl, isLoading } = useResultadoPdfUrl(path);
  if (isLoading) return <span className="text-xs text-muted-foreground">Cargando...</span>;
  if (!signedUrl) return null;
  return (
    <a
      href={signedUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs text-primary underline"
    >
      Ver PDF ↗
    </a>
  );
}

function IpsResultados() {
  const { profile } = useAuth();
  const { data: appointments = [] } = useAppointments(profile?.id, 'ips');
  const { data: atendidas = [] } = useResultados(profile?.id, 'ips');
  const addResultado = useAddResultado();

  const pendientes = appointments.filter((a) => a.estado === 'agendada');

  const [open, setOpen] = useState(false);
  const [apptId, setApptId] = useState<string>("");
  const [diagnostico, setDiagnostico] = useState("");
  const [apto, setApto] = useState<"apto" | "apto_restricciones" | "no_apto">("apto");
  const [obs, setObs] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setApptId(""); setDiagnostico(""); setObs(""); setApto("apto");
    setPdfFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const submit = () => {
    const appt = appointments.find((a) => a.id === apptId);
    if (!appt) return toast.error("Selecciona una cita");
    if (!diagnostico.trim()) return toast.error("Diagnóstico requerido");
    if (!pdfFile) return toast.error("El PDF del resultado es obligatorio");

    addResultado.mutate({
      appointment_id: appt.id,
      solicitante_id: appt.solicitante_id,
      ips_id: appt.ips_id,
      empleado_nombre: appt.empleado_nombre,
      empleado_cedula: appt.empleado_cedula,
      fecha: new Date().toISOString().slice(0, 10),
      diagnostico,
      apto,
      observaciones: obs,
      pdfFile,
    }, {
      onSuccess: () => {
        toast.success("Resultado cargado");
        setOpen(false);
        resetForm();
      },
      onError: (err: any) => toast.error(err.message),
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Citas pendientes de resultado</CardTitle>
            <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
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
                            {a.fecha} {a.hora} · {a.empleado_nombre} ({a.empleado_cedula})
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
                  <div>
                    <Label>Resultado PDF <span className="text-destructive">*</span></Label>
                    <div className="mt-1">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,application/pdf"
                        className="block w-full text-sm text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
                        onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
                      />
                      {pdfFile && (
                        <p className="text-xs text-muted-foreground mt-1">{pdfFile.name}</p>
                      )}
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={submit} disabled={addResultado.isPending}>
                    {addResultado.isPending ? "Guardando..." : "Guardar"}
                  </Button>
                </DialogFooter>
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
                  <b>{a.empleado_nombre}</b> · {a.fecha} {a.hora} · {a.servicio}
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
              {atendidas.map((r: Resultado) => (
                <li key={r.id} className="py-3">
                  <div className="font-medium">{r.empleado_nombre} · {r.empleado_cedula}</div>
                  <div className="text-xs text-muted-foreground">{r.fecha} — Aptitud: {r.apto.replace("_", " ")}</div>
                  <div className="text-sm mt-1">{r.diagnostico}</div>
                  {r.observaciones && <div className="text-xs text-muted-foreground mt-1">Obs: {r.observaciones}</div>}
                  {r.pdf_url && (
                    <div className="mt-1">
                      <ResultadoPdfLink path={r.pdf_url} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
