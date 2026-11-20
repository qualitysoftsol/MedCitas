import { useState } from "react";
import { Loader2, SquarePen } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EnlaceSelector, EnlaceTarjeta } from "./Enlaces";
import { useIniciarConversacion, useIpsParaChat, type Enlace, type LadoChat } from "@/lib/hooks/useMensajes";

export const AVISO_DATOS = "No escribas diagnósticos ni datos clínicos: los mensajes no se pueden editar ni borrar.";

/** Botón y formulario para abrir un tema nuevo. El administrador elige la IPS. */
export function NuevaConversacionDialog({
  lado,
  ipsId: ipsPropia,
  onCreada,
}: {
  lado: LadoChat;
  /** Para la IPS: su propio id (no elige con quién hablar). */
  ipsId?: string;
  onCreada: (conversacionId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [ipsElegida, setIpsElegida] = useState<string>("");
  const [asunto, setAsunto] = useState("");
  const [cuerpo, setCuerpo] = useState("");
  const [enlace, setEnlace] = useState<Enlace | null>(null);
  const { data: listaIps = [] } = useIpsParaChat(open && lado === "admin");
  const iniciar = useIniciarConversacion();

  const ipsId = lado === "admin" ? ipsElegida || undefined : ipsPropia;
  const listo = !!ipsId && asunto.trim() !== "" && cuerpo.trim() !== "";

  const reiniciar = () => {
    setIpsElegida("");
    setAsunto("");
    setCuerpo("");
    setEnlace(null);
  };

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!listo) return;
    iniciar.mutate(
      { ipsId: lado === "admin" ? ipsId : undefined, asunto, cuerpo, enlace },
      {
        onSuccess: (id) => {
          setOpen(false);
          reiniciar();
          onCreada(id);
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reiniciar(); }}>
      <DialogTrigger asChild>
        <Button><SquarePen /> Nueva conversación</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={enviar} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Nueva conversación</DialogTitle>
            <DialogDescription>
              {lado === "admin" ? "Escribe a una IPS sobre un tema." : "Escribe al administrador de MedCitas sobre un tema."}
            </DialogDescription>
          </DialogHeader>

          {lado === "admin" && (
            <div className="space-y-1.5">
              <Label htmlFor="nueva-ips">IPS</Label>
              <Select
                value={ipsElegida}
                onValueChange={(v) => { setIpsElegida(v); setEnlace(null); }}
              >
                <SelectTrigger id="nueva-ips"><SelectValue placeholder="Elige la IPS" /></SelectTrigger>
                <SelectContent>
                  {listaIps.map((i) => (
                    <SelectItem key={i.id} value={i.id}>{i.nombre}{i.ciudad ? ` · ${i.ciudad}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="nueva-asunto">Asunto</Label>
            <Input
              id="nueva-asunto"
              value={asunto}
              onChange={(e) => setAsunto(e.target.value)}
              maxLength={150}
              placeholder="Ej.: Reprogramar cita del 20 de noviembre"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nueva-mensaje">Mensaje</Label>
            <Textarea
              id="nueva-mensaje"
              value={cuerpo}
              onChange={(e) => setCuerpo(e.target.value)}
              maxLength={4000}
              rows={5}
              aria-describedby="nueva-aviso"
            />
            <p id="nueva-aviso" className="text-xs text-muted-foreground">{AVISO_DATOS}</p>
          </div>

          <div className="space-y-2">
            {enlace ? (
              <EnlaceTarjeta
                cita={enlace.tipo === "cita" ? enlace.cita : null}
                resultado={enlace.tipo === "resultado" ? enlace.resultado : null}
                onQuitar={() => setEnlace(null)}
              />
            ) : (
              <EnlaceSelector ipsId={ipsId} onChange={setEnlace} />
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={!listo || iniciar.isPending}>
              {iniciar.isPending && <Loader2 className="animate-spin" />} Enviar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
