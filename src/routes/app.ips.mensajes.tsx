import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PaginaMensajes } from "@/components/mensajes/Mensajes";

export const Route = createFileRoute("/app/ips/mensajes")({
  validateSearch: (s: Record<string, unknown>) => ({
    c: typeof s.c === "string" ? s.c : undefined,
  }),
  component: IpsMensajes,
});

function IpsMensajes() {
  const { c } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return <PaginaMensajes lado="ips" conversacionId={c} onSeleccionar={(id) => navigate({ search: { c: id } })} />;
}
