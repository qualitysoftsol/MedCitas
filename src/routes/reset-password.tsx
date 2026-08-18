import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Stethoscope } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Nueva contraseña — MedCitas" },
      { name: "description", content: "Define una nueva contraseña para tu cuenta de MedCitas." },
    ],
  }),
  component: ResetPasswordPage,
});

const MIN_PASSWORD = 6;

function ResetPasswordPage() {
  const { updatePassword, logout } = useAuth();
  const navigate = useNavigate();
  // The recovery link carries its tokens in the URL hash. supabase-js reads them and opens
  // a session on its own, so until that resolves we cannot tell if the link is still good.
  const [status, setStatus] = useState<"checking" | "ready" | "invalid">("checking");
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    if (params.get("error") || params.get("error_description")) {
      setStatus("invalid");
      return;
    }
    // getSession() waits for the hash to be processed, so a null session at this point
    // means the link expired, was already used, or was never valid.
    supabase.auth.getSession().then(({ data: { session } }) => {
      setStatus(session ? "ready" : "invalid");
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pass.length < MIN_PASSWORD) return toast.error(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres`);
    if (pass !== confirm) return toast.error("Las contraseñas no coinciden");
    setSaving(true);
    try {
      await updatePassword(pass);
      // The recovery link left a session open. Close it so the new password is the only
      // way back into the account.
      await logout();
      toast.success("Contraseña actualizada. Inicia sesión con la nueva.");
      navigate({ to: "/auth" });
    } catch (err: any) {
      toast.error(err.message ?? "No se pudo actualizar la contraseña");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 bg-[color:var(--muted)]">
      <div className="flex items-center gap-2 mb-6">
        <div className="rounded-xl p-2" style={{ background: "var(--gradient-primary)" }}>
          <Stethoscope className="w-6 h-6 text-primary-foreground" />
        </div>
        <span className="text-2xl font-bold">MedCitas</span>
      </div>
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader>
          <CardTitle>Nueva contraseña</CardTitle>
          <CardDescription>
            {status === "ready"
              ? "Define la contraseña con la que ingresarás a partir de ahora."
              : "Recuperación de acceso a tu cuenta."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {status === "checking" && <p className="text-sm text-muted-foreground">Verificando enlace…</p>}

          {status === "invalid" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                El enlace no es válido o ya venció. Los enlaces caducan en 1 hora y solo pueden usarse una vez.
              </p>
              <Button asChild className="w-full">
                <Link to="/auth">Solicitar uno nuevo</Link>
              </Button>
            </div>
          )}

          {status === "ready" && (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <Label>Nueva contraseña</Label>
                <Input type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="new-password" />
              </div>
              <div>
                <Label>Confirmar contraseña</Label>
                <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
              </div>
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? "Guardando…" : "Guardar contraseña"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
