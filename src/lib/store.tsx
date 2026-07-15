import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEPARTAMENTOS } from "./colombia";

export type Role = "ips" | "empresa" | "admin";

export interface Profile {
  nombre: string;
  telefono?: string;
  direccion?: string;
  descripcion?: string;
}

export interface User {
  id: string;
  usuario: string;
  password: string;
  role: Role;
  profile: Profile;
  // IPS specific
  departamento?: string;
  ciudad?: string;
  lat?: number;
  lng?: number;
  departamentos?: string[]; // servicios / departamentos médicos
  // Empresa specific
  nit?: string;
}

export interface Slot {
  id: string;
  ipsId: string;
  fecha: string; // YYYY-MM-DD
  hora: string; // HH:mm
  departamentoMedico: string;
  ciudad: string;
  taken: boolean;
}

export type TipoExamen = "ingreso" | "anual" | "retiro";

export interface Appointment {
  id: string;
  slotId: string;
  ipsId: string;
  empresaId: string;
  empleadoNombre: string;
  empleadoCedula: string;
  tipoExamen: TipoExamen;
  fecha: string;
  hora: string;
  ciudad: string;
  departamentoMedico: string;
  estado: "agendada" | "atendida" | "cancelada";
}

export interface Resultado {
  id: string;
  appointmentId: string;
  empresaId: string;
  ipsId: string;
  empleadoNombre: string;
  empleadoCedula: string;
  fecha: string;
  diagnostico: string;
  apto: "apto" | "apto_restricciones" | "no_apto";
  observaciones: string;
}

export interface Notification {
  id: string;
  userId: string;
  tipo: "cita_agendada" | "cita_cancelada" | "resultado_cargado";
  titulo: string;
  mensaje: string;
  emailTo?: string;
  createdAt: string;
  read: boolean;
}

interface StoreState {
  currentUser: User | null;
  users: User[];
  slots: Slot[];
  appointments: Appointment[];
  resultados: Resultado[];
  notifications: Notification[];
}

interface StoreCtx extends StoreState {
  login: (usuario: string, password: string) => User | null;
  logout: () => void;
  register: (u: Omit<User, "id">) => { ok: boolean; error?: string };
  updateProfile: (patch: Partial<User>) => void;
  changePassword: (oldP: string, newP: string) => { ok: boolean; error?: string };
  addSlots: (slots: Omit<Slot, "id" | "taken">[]) => void;
  bookAppointment: (a: Omit<Appointment, "id" | "estado">) => void;
  cancelAppointment: (id: string, motivo?: string) => void;
  addResultado: (r: Omit<Resultado, "id">) => void;
  markNotificationsRead: () => void;
  clearNotifications: () => void;
}

const STORAGE = "medapp_state_v2";
const fakeEmail = (u: User) =>
  `${u.usuario}@${u.role === "ips" ? "ips" : u.role === "empresa" ? "empresa" : "medcitas"}.co`;

const seedUsers: User[] = [
  {
    id: "u_admin",
    usuario: "admin",
    password: "admin123",
    role: "admin",
    profile: { nombre: "Administrador General" },
  },
  {
    id: "u_ips_1",
    usuario: "ips_bogota",
    password: "ips123",
    role: "ips",
    profile: { nombre: "Clínica Salud Total", telefono: "6015551234", direccion: "Cra 15 #93-40" },
    departamento: "Cundinamarca",
    ciudad: "Bogotá",
    lat: 4.676,
    lng: -74.048,
    departamentos: ["Medicina General", "Optometría", "Audiometría", "Laboratorio"],
  },
  {
    id: "u_ips_2",
    usuario: "ips_medellin",
    password: "ips123",
    role: "ips",
    profile: { nombre: "IPS Vida Sana", telefono: "6045557890", direccion: "Cll 10 #43-25" },
    departamento: "Antioquia",
    ciudad: "Medellín",
    lat: 6.209,
    lng: -75.567,
    departamentos: ["Medicina General", "Cardiología", "Optometría"],
  },
  {
    id: "u_ips_3",
    usuario: "ips_cali",
    password: "ips123",
    role: "ips",
    profile: { nombre: "Centro Médico Pacífico", telefono: "6025557777", direccion: "Av 6N #23-10" },
    departamento: "Valle del Cauca",
    ciudad: "Cali",
    lat: 3.463,
    lng: -76.531,
    departamentos: ["Medicina General", "Laboratorio", "Radiología"],
  },
  {
    id: "u_emp_1",
    usuario: "empresa_demo",
    password: "emp123",
    role: "empresa",
    profile: { nombre: "Constructora Demo S.A.S", telefono: "3105551234" },
    nit: "900123456-7",
  },
];

function seedSlots(): Slot[] {
  const slots: Slot[] = [];
  const today = new Date();
  const ipsList = seedUsers.filter((u) => u.role === "ips");
  for (const ips of ipsList) {
    for (let d = 1; d <= 7; d++) {
      const date = new Date(today);
      date.setDate(today.getDate() + d);
      const fecha = date.toISOString().slice(0, 10);
      for (const hora of ["08:00", "09:00", "10:00", "14:00", "15:00"]) {
        for (const dep of ips.departamentos ?? ["Medicina General"]) {
          slots.push({
            id: `s_${ips.id}_${fecha}_${hora}_${dep}`,
            ipsId: ips.id,
            fecha,
            hora,
            departamentoMedico: dep,
            ciudad: ips.ciudad!,
            taken: false,
          });
        }
      }
    }
  }
  return slots;
}

const defaultState: StoreState = {
  currentUser: null,
  users: seedUsers,
  slots: seedSlots(),
  appointments: [],
  resultados: [],
  notifications: [],
};

const StoreContext = createContext<StoreCtx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StoreState>(defaultState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE);
      if (raw) setState(JSON.parse(raw));
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(STORAGE, JSON.stringify(state));
  }, [state, hydrated]);

  const value = useMemo<StoreCtx>(() => {
    const uid = () => `id_${Math.random().toString(36).slice(2, 10)}`;
    return {
      ...state,
      login: (usuario, password) => {
        const user = state.users.find((u) => u.usuario === usuario && u.password === password);
        if (user) setState((s) => ({ ...s, currentUser: user }));
        return user ?? null;
      },
      logout: () => setState((s) => ({ ...s, currentUser: null })),
      register: (u) => {
        if (state.users.some((x) => x.usuario === u.usuario))
          return { ok: false, error: "Usuario ya existe" };
        const newUser: User = { ...u, id: uid() };
        setState((s) => ({ ...s, users: [...s.users, newUser], currentUser: newUser }));
        return { ok: true };
      },
      updateProfile: (patch) => {
        setState((s) => {
          if (!s.currentUser) return s;
          const updated = { ...s.currentUser, ...patch, profile: { ...s.currentUser.profile, ...(patch.profile ?? {}) } };
          return {
            ...s,
            currentUser: updated,
            users: s.users.map((u) => (u.id === updated.id ? updated : u)),
          };
        });
      },
      changePassword: (oldP, newP) => {
        if (!state.currentUser) return { ok: false, error: "No autenticado" };
        if (state.currentUser.password !== oldP) return { ok: false, error: "Contraseña actual incorrecta" };
        setState((s) => {
          const updated = { ...s.currentUser!, password: newP };
          return { ...s, currentUser: updated, users: s.users.map((u) => (u.id === updated.id ? updated : u)) };
        });
        return { ok: true };
      },
      addSlots: (newSlots) => {
        setState((s) => ({
          ...s,
          slots: [
            ...s.slots,
            ...newSlots.map((n) => ({ ...n, id: uid(), taken: false }) as Slot),
          ],
        }));
      },
      bookAppointment: (a) => {
        setState((s) => {
          const apptId = uid();
          const empresa = s.users.find((u) => u.id === a.empresaId);
          const ips = s.users.find((u) => u.id === a.ipsId);
          const nowIso = new Date().toISOString();
          const mkNotif = (userId: string, target: User | undefined, titulo: string, mensaje: string, tipo: Notification["tipo"]): Notification => ({
            id: uid(),
            userId,
            tipo,
            titulo,
            mensaje,
            emailTo: target ? fakeEmail(target) : undefined,
            createdAt: nowIso,
            read: false,
          });
          const notifs: Notification[] = [
            mkNotif(
              a.empresaId,
              empresa,
              "Cita agendada",
              `Cita para ${a.empleadoNombre} en ${ips?.profile.nombre ?? "IPS"} el ${a.fecha} a las ${a.hora}.`,
              "cita_agendada",
            ),
            mkNotif(
              a.ipsId,
              ips,
              "Nueva cita recibida",
              `${empresa?.profile.nombre ?? "Empresa"} agendó examen ${a.tipoExamen} para ${a.empleadoNombre} el ${a.fecha} ${a.hora}.`,
              "cita_agendada",
            ),
          ];
          if (typeof window !== "undefined") {
            notifs.forEach((n) => console.info(`[email→${n.emailTo}] ${n.titulo}: ${n.mensaje}`));
          }
          return {
            ...s,
            slots: s.slots.map((sl) => (sl.id === a.slotId ? { ...sl, taken: true } : sl)),
            appointments: [...s.appointments, { ...a, id: apptId, estado: "agendada" }],
            notifications: [...notifs, ...s.notifications],
          };
        });
      },
      cancelAppointment: (id, motivo) => {
        setState((s) => {
          const appt = s.appointments.find((a) => a.id === id);
          if (!appt || appt.estado !== "agendada") return s;
          const empresa = s.users.find((u) => u.id === appt.empresaId);
          const ips = s.users.find((u) => u.id === appt.ipsId);
          const nowIso = new Date().toISOString();
          const suffix = motivo ? ` Motivo: ${motivo}.` : "";
          const notifs: Notification[] = [
            {
              id: uid(),
              userId: appt.empresaId,
              tipo: "cita_cancelada",
              titulo: "Cita cancelada",
              mensaje: `Se canceló la cita de ${appt.empleadoNombre} en ${ips?.profile.nombre ?? "IPS"} (${appt.fecha} ${appt.hora}).${suffix}`,
              emailTo: empresa ? fakeEmail(empresa) : undefined,
              createdAt: nowIso,
              read: false,
            },
            {
              id: uid(),
              userId: appt.ipsId,
              tipo: "cita_cancelada",
              titulo: "Cita cancelada",
              mensaje: `${empresa?.profile.nombre ?? "Empresa"} canceló la cita de ${appt.empleadoNombre} (${appt.fecha} ${appt.hora}).${suffix}`,
              emailTo: ips ? fakeEmail(ips) : undefined,
              createdAt: nowIso,
              read: false,
            },
          ];
          if (typeof window !== "undefined") {
            notifs.forEach((n) => console.info(`[email→${n.emailTo}] ${n.titulo}: ${n.mensaje}`));
          }
          return {
            ...s,
            appointments: s.appointments.map((a) => (a.id === id ? { ...a, estado: "cancelada" } : a)),
            slots: s.slots.map((sl) => (sl.id === appt.slotId ? { ...sl, taken: false } : sl)),
            notifications: [...notifs, ...s.notifications],
          };
        });
      },
      addResultado: (r) => {
        setState((s) => {
          const empresa = s.users.find((u) => u.id === r.empresaId);
          const ips = s.users.find((u) => u.id === r.ipsId);
          const notif: Notification = {
            id: uid(),
            userId: r.empresaId,
            tipo: "resultado_cargado",
            titulo: "Resultado disponible",
            mensaje: `${ips?.profile.nombre ?? "IPS"} cargó el resultado del examen de ${r.empleadoNombre}.`,
            emailTo: empresa ? fakeEmail(empresa) : undefined,
            createdAt: new Date().toISOString(),
            read: false,
          };
          if (typeof window !== "undefined") {
            console.info(`[email→${notif.emailTo}] ${notif.titulo}: ${notif.mensaje}`);
          }
          return {
            ...s,
            resultados: [...s.resultados, { ...r, id: uid() }],
            appointments: s.appointments.map((a) =>
              a.id === r.appointmentId ? { ...a, estado: "atendida" } : a,
            ),
            notifications: [notif, ...s.notifications],
          };
        });
      },
      markNotificationsRead: () => {
        setState((s) => {
          if (!s.currentUser) return s;
          return {
            ...s,
            notifications: s.notifications.map((n) =>
              n.userId === s.currentUser!.id ? { ...n, read: true } : n,
            ),
          };
        });
      },
      clearNotifications: () => {
        setState((s) => {
          if (!s.currentUser) return s;
          return { ...s, notifications: s.notifications.filter((n) => n.userId !== s.currentUser!.id) };
        });
      },
    };
  }, [state]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}

export { DEPARTAMENTOS };
