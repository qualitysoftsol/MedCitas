import { useIpsFotos, useUploadFoto, useDeleteFoto } from "@/lib/hooks/useIpsFotos";
import { ImagePlus, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function IpsFotosSection({ ipsId }: { ipsId: string }) {
  const { data: fotos = [] } = useIpsFotos(ipsId);
  const uploadFoto = useUploadFoto();
  const deleteFoto = useDeleteFoto();
  const MAX_FOTOS = 5;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fotos.length >= MAX_FOTOS) return toast.error("Máximo 5 fotos por IPS");
    uploadFoto.mutate(
      { ipsId, file, orden: fotos.length },
      {
        onSuccess: () => toast.success("Foto subida"),
        onError: (err: any) => toast.error(err.message),
      }
    );
    e.target.value = "";
  };

  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Fotos de instalaciones ({fotos.length}/{MAX_FOTOS})</CardTitle>
          <label className={`cursor-pointer ${fotos.length >= MAX_FOTOS ? "opacity-50 pointer-events-none" : ""}`}>
            <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} disabled={uploadFoto.isPending} />
            <Button asChild variant="outline" size="sm">
              <span>
                <ImagePlus className="w-4 h-4 mr-1" />
                {uploadFoto.isPending ? "Subiendo..." : "Subir foto"}
              </span>
            </Button>
          </label>
        </div>
      </CardHeader>
      <CardContent>
        {fotos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin fotos. La primera foto será la portada.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {fotos.map((foto, i) => (
              <div key={foto.id} className="relative group rounded-md overflow-hidden border aspect-square">
                <img src={foto.url} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                {i === 0 && (
                  <span className="absolute top-1 left-1 bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded font-medium">
                    Portada
                  </span>
                )}
                <button
                  onClick={() => deleteFoto.mutate({ foto, ipsId })}
                  className="absolute top-1 right-1 bg-background/80 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
