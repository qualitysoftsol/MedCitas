# Citas Masivas para Empresa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un selector de modo (Cita individual / Citas masivas) a la ruta `/app/empresa/solicitar`, donde el modo masivo reemplaza los campos Nombre+Cédula por un uploader de archivo `.txt` con formato `Nombre;Cedula`, auto-asigna un slot por empleado, y muestra una vista previa antes de confirmar el agendamiento batch.

**Architecture:** Tabs en la misma página controlados por estado local `modoSolicitud`. El hook `useBookAppointmentsBatch` realiza una inserción batch en Supabase. El resto del flujo (mapa, IPS, departamento, ciudad) es compartido entre ambos modos y no cambia.

**Tech Stack:** React 19, TypeScript, TanStack Router, TanStack Query, Supabase JS v2, Tailwind CSS v4, shadcn/ui (Tabs, Button, Badge, Label), Lucide React, Sonner (toast).

## Global Constraints

- Sin framework de tests — validar con `npx tsc --noEmit` y verificación visual en `localhost:8080`.
- No modificar esquema de base de datos ni migraciones.
- No crear componentes nuevos — todo en los dos archivos indicados.
- Formato de archivo: `Nombre;Cedula` por línea, primera línea puede ser cabecera (ignorar si contiene "nombre" case-insensitive).
- Los slots se toman en el orden que devuelve `useAvailableSlots` (ya ordenados por fecha/hora ascendente).
- Usar `toast` de `sonner` para feedback de errores y éxito, igual que el código existente.
- Conservar el comportamiento actual del modo individual sin ningún cambio.

---

## File Map

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `src/lib/hooks/useAppointments.ts` | Modificar | Agregar `useBookAppointmentsBatch` |
| `src/routes/app.empresa.solicitar.tsx` | Modificar | Tabs, uploader, parsing, preview, submitMasivo |

---

### Task 1: Hook `useBookAppointmentsBatch`

**Files:**
- Modify: `src/lib/hooks/useAppointments.ts`

**Interfaces:**
- Consumes: `BookData` (ya definido en el archivo como `Omit<Appointment, 'id' | 'created_at' | 'estado'>`)
- Produces: `useBookAppointmentsBatch(): UseMutationResult<void, Error, BookData[]>`

- [ ] **Step 1: Agregar el hook al final de `useAppointments.ts`**

Abrir `src/lib/hooks/useAppointments.ts` y agregar al final:

```ts
export function useBookAppointmentsBatch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (citas: BookData[]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('appointments') as any).insert(citas)
      if (error) throw error
      const slotIds = citas.map((c) => c.slot_id)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: slotError } = await (supabase.from('slots') as any)
        .update({ taken: true })
        .in('id', slotIds)
      if (slotError) throw slotError
    },
    onSuccess: (_data, citas) => {
      qc.invalidateQueries({ queryKey: ['appointments'] })
      const ipsId = citas[0]?.ips_id
      if (ipsId) qc.invalidateQueries({ queryKey: ['slots', 'available', ipsId] })
    },
  })
}
```

- [ ] **Step 2: Verificar tipos**

```bash
npx tsc --noEmit
```

Esperado: sin errores nuevos.

- [ ] **Step 3: Commit**

```bash
git add src/lib/hooks/useAppointments.ts
git commit -m "feat: add useBookAppointmentsBatch hook"
```

---

### Task 2: Estado de modo + toggle de tabs en la UI

**Files:**
- Modify: `src/routes/app.empresa.solicitar.tsx`

**Interfaces:**
- Consumes: `useBookAppointmentsBatch` de `src/lib/hooks/useAppointments.ts`
- Produces: estado `modoSolicitud: 'individual' | 'masivo'` y UI de tabs en la tarjeta izquierda

- [ ] **Step 1: Agregar imports necesarios**

En la sección de imports de `app.empresa.solicitar.tsx`, agregar `Upload` a los imports de lucide-react y `useBookAppointmentsBatch` a los imports de useAppointments:

```ts
import { MapPin, Stethoscope, Upload } from "lucide-react";
import { useAvailableSlots } from "@/lib/hooks/useSlots";
import { useBookAppointment, useBookAppointmentsBatch } from "@/lib/hooks/useAppointments";
```

- [ ] **Step 2: Agregar estado de modo y empleados al componente**

Dentro de la función `EmpresaSolicitar`, después de la línea `const [showDetail, setShowDetail] = useState(false);`, agregar:

```ts
const [modoSolicitud, setModoSolicitud] = useState<'individual' | 'masivo'>('individual');
const [archivoEmpleados, setArchivoEmpleados] = useState<{ nombre: string; cedula: string }[]>([]);
const [archivoError, setArchivoError] = useState<string | null>(null);

const bookAppointmentsBatch = useBookAppointmentsBatch();
```

- [ ] **Step 3: Agregar el toggle de tabs al inicio de la tarjeta izquierda**

Localizar el elemento `<CardHeader><CardTitle>Datos del empleado</CardTitle></CardHeader>` y reemplazarlo por:

```tsx
<CardHeader>
  <CardTitle>Datos del empleado</CardTitle>
  <div className="flex gap-2 mt-2">
    <Button
      type="button"
      variant={modoSolicitud === 'individual' ? 'default' : 'outline'}
      size="sm"
      onClick={() => { setModoSolicitud('individual'); setArchivoEmpleados([]); setArchivoError(null); }}
    >
      Cita individual
    </Button>
    <Button
      type="button"
      variant={modoSolicitud === 'masivo' ? 'default' : 'outline'}
      size="sm"
      onClick={() => { setModoSolicitud('masivo'); setEmpleadoNombre(''); setEmpleadoCedula(''); setSelectedSlot(null); }}
    >
      Citas masivas
    </Button>
  </div>
</CardHeader>
```

- [ ] **Step 4: Verificar tipos y visual**

```bash
npx tsc --noEmit
```

Luego abrir `http://localhost:8080/app/empresa/solicitar` (si el dev server está corriendo) y confirmar que los dos botones aparecen bajo el título y cambian de estilo al hacer clic.

- [ ] **Step 5: Commit**

```bash
git add src/routes/app.empresa.solicitar.tsx
git commit -m "feat: add mode toggle tabs to empresa solicitar"
```

---

### Task 3: File uploader + función de parsing

**Files:**
- Modify: `src/routes/app.empresa.solicitar.tsx`

**Interfaces:**
- Consumes: `modoSolicitud`, `archivoEmpleados`, `archivoError`, `setArchivoEmpleados`, `setArchivoError`
- Produces:
  - `parsearArchivo(text: string): { nombre: string; cedula: string }[]` — función pura de parsing
  - UI condicional: si `modoSolicitud === 'individual'` → campos actuales; si `'masivo'` → uploader

- [ ] **Step 1: Agregar la función `parsearArchivo` dentro del componente**

Dentro de `EmpresaSolicitar`, después de la función `geolocate`, agregar:

```ts
const parsearArchivo = (text: string): { nombre: string; cedula: string }[] => {
  const lineas = text.split('\n').map((l) => l.trim()).filter(Boolean);
  let ignoradas = 0;
  const empleados: { nombre: string; cedula: string }[] = [];
  for (const linea of lineas) {
    // Ignorar cabecera
    if (linea.toLowerCase().startsWith('nombre')) continue;
    const partes = linea.split(';');
    if (partes.length < 2 || !partes[0].trim() || !partes[1].trim()) {
      ignoradas++;
      continue;
    }
    empleados.push({ nombre: partes[0].trim(), cedula: partes[1].trim() });
  }
  if (ignoradas > 0) {
    toast.warning(`${ignoradas} línea(s) ignoradas por formato inválido`);
  }
  return empleados;
};

const handleArchivoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const text = ev.target?.result as string;
    const empleados = parsearArchivo(text);
    if (empleados.length === 0) {
      setArchivoError('El archivo no contiene empleados válidos. Usa el formato: Nombre;Cedula');
      setArchivoEmpleados([]);
    } else {
      setArchivoError(null);
      setArchivoEmpleados(empleados);
    }
  };
  reader.readAsText(file, 'UTF-8');
};
```

- [ ] **Step 2: Reemplazar la sección de campos Nombre+Cédula con UI condicional**

Localizar el bloque:

```tsx
<div className="grid grid-cols-2 gap-3">
  <div>
    <Label>Nombre</Label>
    <Input value={empleadoNombre} onChange={(e) => setEmpleadoNombre(e.target.value)} />
  </div>
  <div>
    <Label>Cédula</Label>
    <Input value={empleadoCedula} onChange={(e) => setEmpleadoCedula(e.target.value)} />
  </div>
</div>
```

Reemplazarlo por:

```tsx
{modoSolicitud === 'individual' ? (
  <div className="grid grid-cols-2 gap-3">
    <div>
      <Label>Nombre</Label>
      <Input value={empleadoNombre} onChange={(e) => setEmpleadoNombre(e.target.value)} />
    </div>
    <div>
      <Label>Cédula</Label>
      <Input value={empleadoCedula} onChange={(e) => setEmpleadoCedula(e.target.value)} />
    </div>
  </div>
) : (
  <div className="space-y-2">
    <Label>Archivo de empleados (.txt)</Label>
    <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary transition-colors">
      <div className="flex flex-col items-center gap-1 text-sm text-muted-foreground">
        <Upload className="w-5 h-5" />
        <span>Haz clic para cargar el archivo</span>
        <span className="text-xs">Formato: Nombre;Cedula — un empleado por línea</span>
      </div>
      <input type="file" accept=".txt" className="hidden" onChange={handleArchivoChange} />
    </label>
    {archivoError && (
      <p className="text-xs text-destructive">{archivoError}</p>
    )}
    {archivoEmpleados.length > 0 && (
      <p className="text-xs text-muted-foreground">
        {archivoEmpleados.length} empleado(s) cargado(s):{' '}
        {archivoEmpleados.slice(0, 3).map((e) => e.nombre).join(', ')}
        {archivoEmpleados.length > 3 && '...'}
      </p>
    )}
  </div>
)}
```

- [ ] **Step 3: Verificar tipos y visual**

```bash
npx tsc --noEmit
```

En el navegador:
- Cambiar al tab "Citas masivas" → ver uploader con ícono y texto.
- Cargar un archivo `.txt` con contenido `Juan Pérez;12345678\nMaría Gómez;87654321` → ver "2 empleado(s) cargado(s): Juan Pérez, María Gómez".
- Cargar archivo vacío → ver error.

- [ ] **Step 4: Commit**

```bash
git add src/routes/app.empresa.solicitar.tsx
git commit -m "feat: add file uploader and parsing for citas masivas"
```

---

### Task 4: Vista previa de auto-asignación + `submitMasivo`

**Files:**
- Modify: `src/routes/app.empresa.solicitar.tsx`

**Interfaces:**
- Consumes:
  - `archivoEmpleados: { nombre: string; cedula: string }[]`
  - `slotsIps` de `useAvailableSlots(selectedIps)`
  - `bookAppointmentsBatch` de `useBookAppointmentsBatch()`
  - `profile`, `tipoExamen`, `selectedIps`, `slotsIps` — ya en el componente
- Produces: sección de confirmación en modo masivo reemplazando la grilla de slots individual

- [ ] **Step 1: Agregar la función `submitMasivo` dentro del componente**

Después de la función `submit` existente, agregar:

```ts
const submitMasivo = () => {
  const pares = archivoEmpleados.map((emp, i) => ({
    empleado: emp,
    slot: slotsIps[i] ?? null,
  }));
  const citasValidas = pares.filter((p) => p.slot !== null);
  if (citasValidas.length === 0) return toast.error('No hay horarios disponibles para esta IPS');

  const citas = citasValidas.map(({ empleado, slot }) => ({
    slot_id: slot!.id,
    ips_id: slot!.ips_id,
    solicitante_id: profile!.id,
    empleado_nombre: empleado.nombre,
    empleado_cedula: empleado.cedula,
    tipo_examen: tipoExamen,
    fecha: slot!.fecha,
    hora: slot!.hora,
    ciudad: slot!.ciudad,
    servicio: slot!.servicio,
  }));

  bookAppointmentsBatch.mutate(citas, {
    onSuccess: () => {
      toast.success(`${citas.length} cita(s) agendada(s)`);
      setArchivoEmpleados([]);
      setArchivoError(null);
      setSelectedIps(null);
      setShowDetail(false);
    },
    onError: (err: any) => toast.error(err.message),
  });
};
```

- [ ] **Step 2: Agregar la vista previa masiva en la sección de horarios**

Localizar el bloque que comienza con:

```tsx
{selectedIps && !showDetail && (
  <Card className="lg:col-span-2">
    <CardHeader>
      <CardTitle>Horarios disponibles — {ipsEnCiudad.find(u=>u.id===selectedIps)?.nombre}</CardTitle>
    </CardHeader>
    <CardContent>
```

Reemplazar TODO el contenido de `<CardContent>` dentro de ese bloque (desde `{slotsIps.length === 0 ?` hasta el `</CardContent>` de cierre) por:

```tsx
<CardContent>
  {modoSolicitud === 'individual' ? (
    <>
      {slotsIps.length === 0 ? (
        <p className="text-sm text-muted-foreground">Esta IPS no tiene horarios disponibles.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {slotsIps.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedSlot(s.id)}
              className={`text-left rounded-md border p-2 hover:border-primary transition ${selectedSlot===s.id ? "border-primary bg-accent/50" : ""}`}
            >
              <div className="text-sm font-medium">{s.fecha}</div>
              <div className="text-xs text-muted-foreground">{s.hora} · {s.servicio}</div>
            </button>
          ))}
        </div>
      )}
      <div className="mt-4 flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {selectedSlot ? (
            <>Horario: <Badge>{slotsIps.find(s=>s.id===selectedSlot)?.fecha} {slotsIps.find(s=>s.id===selectedSlot)?.hora}</Badge></>
          ) : "Selecciona un horario"}
        </div>
        <Button onClick={submit} disabled={!selectedSlot}>Agendar cita</Button>
      </div>
    </>
  ) : (
    // Modo masivo: vista previa de auto-asignación
    (() => {
      const pares = archivoEmpleados.map((emp, i) => ({
        empleado: emp,
        slot: slotsIps[i] ?? null,
      }));
      const conSlot = pares.filter((p) => p.slot !== null).length;
      const sinSlot = pares.length - conSlot;
      return (
        <>
          {archivoEmpleados.length === 0 ? (
            <p className="text-sm text-muted-foreground">Carga un archivo de empleados para ver los horarios asignados.</p>
          ) : slotsIps.length === 0 ? (
            <p className="text-sm text-muted-foreground">Esta IPS no tiene horarios disponibles.</p>
          ) : (
            <>
              {sinSlot > 0 && (
                <p className="text-sm text-amber-600 mb-3">
                  Solo se agendarán <strong>{conSlot}</strong> de <strong>{pares.length}</strong> empleados — no hay suficientes horarios disponibles.
                </p>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">Empleado</th>
                      <th className="py-2 pr-4 font-medium">Cédula</th>
                      <th className="py-2 font-medium">Horario asignado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {pares.map(({ empleado, slot }, idx) => (
                      <tr key={idx}>
                        <td className="py-2 pr-4">{empleado.nombre}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{empleado.cedula}</td>
                        <td className="py-2">
                          {slot ? (
                            <Badge variant="outline">{slot.fecha} {slot.hora}</Badge>
                          ) : (
                            <span className="text-destructive text-xs">Sin horario disponible</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setSelectedIps(null)}>Cancelar</Button>
                <Button
                  onClick={submitMasivo}
                  disabled={conSlot === 0 || bookAppointmentsBatch.isPending}
                >
                  {bookAppointmentsBatch.isPending ? 'Agendando...' : `Agendar ${conSlot} cita(s)`}
                </Button>
              </div>
            </>
          )}
        </>
      );
    })()
  )}
</CardContent>
```

- [ ] **Step 3: Verificar tipos**

```bash
npx tsc --noEmit
```

Esperado: sin errores.

- [ ] **Step 4: Verificar visual en navegador**

Flujo a probar en `http://localhost:8080/app/empresa/solicitar` con un usuario empresa:

1. **Modo individual** — confirmar que el flujo existente funciona igual: campos Nombre/Cédula, grilla de slots, "Agendar cita".
2. **Modo masivo** — cargar archivo `.txt` con 2+ empleados → elegir ciudad → elegir IPS → ver tabla de previsualización con empleados y slots asignados → "Agendar N citas".
3. **Más empleados que slots** — cargar archivo con 10 empleados, elegir IPS con 3 slots → ver aviso amarillo "Solo se agendarán 3 de 10" → filas sin slot muestran "Sin horario disponible" en rojo.
4. **IPS sin slots en modo masivo** → ver "Esta IPS no tiene horarios disponibles".
5. **Archivo inválido** → ver mensaje de error bajo el uploader.

- [ ] **Step 5: Commit final**

```bash
git add src/routes/app.empresa.solicitar.tsx
git commit -m "feat: citas masivas con vista previa y auto-asignacion de slots"
```
