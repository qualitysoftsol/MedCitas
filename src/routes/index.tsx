import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { currentUser } = useStore();
  if (!currentUser) return <Navigate to="/auth" />;
  if (currentUser.role === "admin") return <Navigate to="/app/admin" />;
  if (currentUser.role === "ips") return <Navigate to="/app/ips/calendario" />;
  return <Navigate to="/app/empresa/solicitar" />;
}
