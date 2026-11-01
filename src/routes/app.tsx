import { createFileRoute, Outlet, Link, Navigate, useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import type { Profile } from "@/lib/database.types";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarRail, SidebarTrigger, useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CalendarDays, ClipboardList, FileUp, Users, Building2, ShieldCheck, LogOut, LayoutDashboard, Stethoscope,
  User, BookOpen, House, CalendarPlus, FileText, UserRound, ChevronDown, Lock, Percent, Receipt,
} from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";
import { Logo } from "@/components/app/Logo";
import { iniciales } from "@/lib/format";
import { cn } from "@/lib/utils";

type Role = Profile["role"];

export const Route = createFileRoute("/app")({
  component: AppLayout,
});

interface NavItem { to: string; title: string; icon: React.ComponentType<{ className?: string }> }

// "Principal" agrupa las tareas del día a día; "Cuenta" lo relacionado con el usuario.
const NAV: Record<Role, NavItem[]> = {
  ips: [
    { to: "/app/ips/calendario", title: "Calendario", icon: CalendarDays },
    { to: "/app/ips/citas", title: "Citas agendadas", icon: ClipboardList },
    { to: "/app/ips/resultados", title: "Cargar resultados", icon: FileUp },
  ],
  empresa: [
    { to: "/app/empresa/solicitar", title: "Solicitar cita", icon: CalendarPlus },
    { to: "/app/empresa/citas", title: "Mis citas", icon: CalendarDays },
    { to: "/app/empresa/resultados", title: "Resultados", icon: FileText },
    { to: "/app/empresa/facturas", title: "Facturas", icon: Receipt },
  ],
  particular: [
    { to: "/app/particular", title: "Inicio", icon: House },
    { to: "/app/particular/solicitar", title: "Solicitar cita", icon: CalendarPlus },
    { to: "/app/particular/citas", title: "Mis citas", icon: CalendarDays },
    { to: "/app/particular/resultados", title: "Mis resultados", icon: FileText },
  ],
  admin: [
    { to: "/app/admin", title: "Panel", icon: LayoutDashboard },
    { to: "/app/admin/registrar", title: "Registrar IPS/Empresa", icon: Users },
    { to: "/app/admin/catalogos", title: "Catálogos", icon: BookOpen },
    { to: "/app/admin/comisiones", title: "Comisiones", icon: Percent },
    { to: "/app/admin/facturacion", title: "Facturación", icon: Receipt },
    { to: "/app/admin/menus", title: "Menús por rol", icon: ShieldCheck },
  ],
};

const CUENTA: NavItem[] = [{ to: "/app/perfil", title: "Mi perfil", icon: UserRound }];

const ROLE_META: Record<Role, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  particular: { label: "Particular", icon: User },
  empresa: { label: "Empresa", icon: Building2 },
  ips: { label: "IPS", icon: Stethoscope },
  admin: { label: "Administrador", icon: ShieldCheck },
};

const normalize = (p: string) => (p.length > 1 ? p.replace(/\/+$/, "") : p);

function AppLayout() {
  const { profile, loading } = useAuth();
  if (loading) return <ShellSkeleton />;
  if (!profile) return <Navigate to="/auth" />;

  return (
    <SidebarProvider>
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Saltar al contenido
      </a>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar items={NAV[profile.role]} role={profile.role} />
        <div className="flex min-w-0 flex-1 flex-col">
          <AppHeader profile={profile} />
          <main id="contenido" tabIndex={-1} className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 focus:outline-none md:px-6 lg:px-8 lg:py-8">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function ShellSkeleton() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Logo />
        <span className="text-sm">Cargando tu cuenta…</span>
      </div>
    </div>
  );
}

function AppHeader({ profile }: { profile: Profile }) {
  const { email, logout } = useAuth();
  const navigate = useNavigate();
  const role = ROLE_META[profile.role];

  const signOut = async () => {
    await logout();
    navigate({ to: "/auth" });
  };

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b bg-card/90 px-3 backdrop-blur supports-[backdrop-filter]:bg-card/75 md:px-6">
      <SidebarTrigger className="size-10 rounded-lg" aria-label="Abrir o cerrar menú" />
      <Link to="/" className="rounded-lg md:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="MedCitas, ir al inicio">
        <Logo />
      </Link>

      <div className="ml-auto flex items-center gap-1 md:gap-2">
        <NotificationBell />
        <DropdownMenu>
          <DropdownMenuTrigger
            className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-2 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted"
            aria-label={`Menú de usuario: ${profile.nombre}`}
          >
            <span className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground" aria-hidden>
              {iniciales(profile.nombre)}
            </span>
            <span className="hidden max-w-[12rem] text-left leading-tight sm:block">
              <span className="block truncate text-sm font-semibold">{profile.nombre}</span>
              <span className="block text-xs text-muted-foreground">{role.label}</span>
            </span>
            <ChevronDown className="hidden size-4 text-muted-foreground sm:block" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8} className="w-64">
            <DropdownMenuLabel className="font-normal">
              <div className="truncate text-sm font-semibold">{profile.nombre}</div>
              {email && <div className="truncate text-xs text-muted-foreground">{email}</div>}
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-accent-foreground">
                <role.icon className="size-3.5" /> Cuenta {role.label.toLowerCase()}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="cursor-pointer py-2">
              <Link to="/app/perfil"><UserRound /> Mi perfil</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="cursor-pointer py-2">
              <Link to="/app/perfil" hash="seguridad"><Lock /> Seguridad de la cuenta</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => { void signOut(); }} className="cursor-pointer py-2 text-danger-foreground focus:bg-danger-soft focus:text-danger-foreground">
              <LogOut /> Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

function AppSidebar({ items, role }: { items: NavItem[]; role: Role }) {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed" && !isMobile;
  const currentPath = normalize(useRouterState({ select: (r) => r.location.pathname }));
  const meta = ROLE_META[role];

  const renderItems = (list: NavItem[]) =>
    list.map((it) => {
      const active = currentPath === normalize(it.to);
      return (
        <SidebarMenuItem key={it.to}>
          <SidebarMenuButton
            asChild
            isActive={active}
            tooltip={it.title}
            className={cn(
              "relative h-10 rounded-lg px-3 text-[14px] font-medium text-sidebar-foreground/85",
              "data-[active=true]:bg-sidebar-accent data-[active=true]:font-semibold data-[active=true]:text-sidebar-accent-foreground",
              "data-[active=true]:before:absolute data-[active=true]:before:inset-y-2 data-[active=true]:before:left-0 data-[active=true]:before:w-1 data-[active=true]:before:rounded-r-full data-[active=true]:before:bg-primary",
              "[&>svg]:size-[18px]",
            )}
          >
            <Link to={it.to} aria-current={active ? "page" : undefined} onClick={() => isMobile && setOpenMobile(false)}>
              <it.icon />
              <span>{it.title}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      );
    });

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarHeader className="h-16 justify-center border-b px-3 group-data-[collapsible=icon]:px-2">
        <Link to="/" className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="MedCitas, ir al inicio">
          <Logo collapsed={collapsed} />
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-1 py-2">
        {!collapsed && (
          <div className="mx-3 mt-2 flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            <meta.icon className="size-4 text-accent-foreground" aria-hidden />
            <span>Cuenta <strong className="font-semibold text-foreground">{meta.label}</strong></span>
          </div>
        )}
        <SidebarGroup>
          <SidebarGroupLabel className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Principal</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{renderItems(items)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Cuenta</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{renderItems(CUENTA)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {!collapsed && (
        <SidebarFooter className="p-3">
          <div className="flex gap-3 rounded-xl bg-primary-soft p-3">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-accent-foreground" aria-hidden />
            <div className="text-xs">
              <p className="font-semibold text-accent-foreground">Tu información está protegida</p>
              <p className="mt-0.5 text-muted-foreground">Solo las personas autorizadas pueden ver tus datos médicos.</p>
            </div>
          </div>
        </SidebarFooter>
      )}
      <SidebarRail />
    </Sidebar>
  );
}
