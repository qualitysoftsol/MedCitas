import { createFileRoute, Outlet, Link, Navigate, useNavigate, useRouterState } from "@tanstack/react-router";
import { useStore, type Role } from "@/lib/store";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, useSidebar,
} from "@/components/ui/sidebar";
import {
  CalendarDays, ClipboardList, FileUp, MapPin, Users, Building2, ShieldCheck,
  UserCircle, LogOut, LayoutDashboard, Stethoscope, FilePlus2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/NotificationBell";

export const Route = createFileRoute("/app")({
  component: AppLayout,
});

interface NavItem { to: string; title: string; icon: React.ComponentType<{ className?: string }> }

const NAV: Record<Role, NavItem[]> = {
  ips: [
    { to: "/app/ips/calendario", title: "Calendario", icon: CalendarDays },
    { to: "/app/ips/citas", title: "Citas agendadas", icon: ClipboardList },
    { to: "/app/ips/resultados", title: "Cargar resultados", icon: FileUp },
  ],
  empresa: [
    { to: "/app/empresa/solicitar", title: "Solicitar cita", icon: MapPin },
    { to: "/app/empresa/citas", title: "Mis citas", icon: ClipboardList },
    { to: "/app/empresa/resultados", title: "Resultados", icon: FilePlus2 },
  ],
  admin: [
    { to: "/app/admin", title: "Panel", icon: LayoutDashboard },
    { to: "/app/admin/registrar", title: "Registrar IPS/Empresa", icon: Users },
    { to: "/app/admin/menus", title: "Menús por rol", icon: ShieldCheck },
  ],
};

function AppLayout() {
  const { currentUser, logout } = useStore();
  const navigate = useNavigate();
  if (!currentUser) return <Navigate to="/auth" />;

  const items = NAV[currentUser.role];

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-[color:var(--muted)]">
        <AppSidebar items={items} role={currentUser.role} />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center gap-2 border-b bg-card px-3 sticky top-0 z-10">
            <SidebarTrigger />
            <div className="flex items-center gap-2">
              <div className="rounded-lg p-1.5" style={{ background: "var(--gradient-primary)" }}>
                <Stethoscope className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-semibold">MedCitas</span>
            </div>
            <div className="ml-auto flex items-center gap-1">
              <NotificationBell />
              <Link to="/app/perfil" className="hidden sm:flex items-center gap-2 text-sm hover:text-primary px-2">
                <UserCircle className="w-4 h-4" />
                {currentUser.profile.nombre}
              </Link>
              <Button variant="ghost" size="sm" onClick={() => { logout(); navigate({ to: "/auth" }); }}>
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </header>
          <main className="flex-1 p-4 md:p-6 max-w-6xl w-full mx-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function AppSidebar({ items, role }: { items: NavItem[]; role: Role }) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const currentPath = useRouterState({ select: (r) => r.location.pathname });

  const roleIcon = role === "ips" ? Stethoscope : role === "empresa" ? Building2 : ShieldCheck;
  const RoleIcon = roleIcon;

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>
            <div className="flex items-center gap-2">
              <RoleIcon className="w-4 h-4" />
              {!collapsed && <span className="capitalize">{role}</span>}
            </div>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((it) => (
                <SidebarMenuItem key={it.to}>
                  <SidebarMenuButton asChild isActive={currentPath === it.to}>
                    <Link to={it.to} className="flex items-center gap-2">
                      <it.icon className="w-4 h-4" />
                      {!collapsed && <span>{it.title}</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={currentPath === "/app/perfil"}>
                  <Link to="/app/perfil" className="flex items-center gap-2">
                    <UserCircle className="w-4 h-4" />
                    {!collapsed && <span>Mi perfil</span>}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
