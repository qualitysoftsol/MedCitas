import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { profile, loading } = useAuth();
  if (loading) return null;
  if (!profile) return <Navigate to="/auth" />;
  if (profile.role === "admin") return <Navigate to="/app/admin" />;
  if (profile.role === "ips") return <Navigate to="/app/ips/calendario" />;
  if (profile.role === "particular") return <Navigate to="/app/particular" />;
  return <Navigate to="/app/empresa/solicitar" />;
}
