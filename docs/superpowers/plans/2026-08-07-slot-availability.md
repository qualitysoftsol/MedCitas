# Slot Availability — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Garantizar que los slots ya agendados no aparezcan disponibles en las vistas de empresa/particular, y que el calendario IPS muestre "Agendada" (badge rojo) en lugar de "Ocupado".

**Architecture:** Tres cambios quirúrgicos en archivos existentes: (1) forzar refresco de datos en `useAvailableSlots`, (2) ampliar la invalidación de caché en las mutaciones de agendamiento, (3) actualizar el badge visual en el calendario IPS.

**Tech Stack:** React, TanStack Query (React Query v5), Supabase, TypeScript, shadcn/ui `Badge`.

## Global Constraints

- No introducir nuevas dependencias.
- No reestructurar archivos existentes — solo editar las líneas necesarias.
- Mantener el comportamiento de cancelación intacto (`useCancelAppointment` ya invalida `['slots']` correctamente).
- TypeScript debe compilar sin errores nuevos.

---

### Task 1: `useAvailableSlots` — datos siempre frescos

**Files:**
- Modify: `src/lib/hooks/useSlots.ts:23-39`

**Interfaces:**
- Produce: `useAvailableSlots(ipsId)` — mismo contrato de retorno, ahora con `staleTime: 0` y `refetchOnMount: 'always'`.

- [ ] **Step 1: Abrir el archivo**

  Abrir `src/lib/hooks/useSlots.ts`. La función `useAvailableSlots` empieza en la línea 23. Actualmente tiene solo `enabled: !!ipsId` como opción extra.

- [ ] **Step 2: Agregar las opciones de refresco**

  Reemplazar el bloque de la función `useAvailableSlots` (líneas 23-40) con:

  ```ts
  export function useAvailableSlots(ipsId: string | null) {
    return useQuery({
      queryKey: ['slots', 'available', ipsId],
      queryFn: async () => {
        if (!ipsId) return []
        const { data, error } = await supabase
          .from('slots')
          .select('*')
          .eq('ips_id', ipsId)
          .eq('taken', false)
          .order('fecha')
          .order('hora')
        if (error) throw error
        return data as Slot[]
      },
      enabled: !!ipsId,
      staleTime: 0,
      refetchOnMount: 'always',
    })
  }
  ```

- [ ] **Step 3: Verificar que TypeScript compila**

  ```powershell
  npx tsc --noEmit
  ```

  Esperado: sin errores nuevos.

- [ ] **Step 4: Commit**

  ```powershell
  git add src/lib/hooks/useSlots.ts
  git commit -m "fix: useAvailableSlots always fetches fresh data on mount"
  ```

---

### Task 2: Invalidar `['slots', ipsId]` al agendar

**Files:**
- Modify: `src/lib/hooks/useAppointments.ts:37-53` (useBookAppointment) y `:75-95` (useBookAppointmentsBatch)

**Interfaces:**
- Consumes: `queryKey: ['slots', ipsId]` — el mismo key que usa `useSlots(profile?.id)` en el calendario IPS.
- Produce: tras agendamiento exitoso, el calendario IPS invalida su caché y refetch.

- [ ] **Step 1: Agregar invalidación en `useBookAppointment`**

  En `src/lib/hooks/useAppointments.ts`, localizar el bloque `onSuccess` de `useBookAppointment` (actualmente líneas 48-52). Reemplazarlo con:

  ```ts
  onSuccess: (_data, variables) => {
    qc.invalidateQueries({ queryKey: ['appointments'] })
    qc.invalidateQueries({ queryKey: ['slots', 'available', variables.ips_id] })
    qc.invalidateQueries({ queryKey: ['slots', variables.ips_id] })
  },
  ```

- [ ] **Step 2: Agregar invalidación en `useBookAppointmentsBatch`**

  Localizar el bloque `onSuccess` de `useBookAppointmentsBatch` (actualmente líneas 88-93). Reemplazarlo con:

  ```ts
  onSuccess: (_data, citas) => {
    qc.invalidateQueries({ queryKey: ['appointments'] })
    const ipsId = citas[0]?.ips_id
    if (ipsId) qc.invalidateQueries({ queryKey: ['slots', 'available', ipsId] })
    if (ipsId) qc.invalidateQueries({ queryKey: ['slots', ipsId] })
  },
  ```

- [ ] **Step 3: Verificar que TypeScript compila**

  ```powershell
  npx tsc --noEmit
  ```

  Esperado: sin errores nuevos.

- [ ] **Step 4: Commit**

  ```powershell
  git add src/lib/hooks/useAppointments.ts
  git commit -m "fix: invalidate IPS slots cache after booking appointment"
  ```

---

### Task 3: Badge "Agendada" en el calendario IPS

**Files:**
- Modify: `src/routes/app.ips.calendario.tsx:117-119`

**Interfaces:**
- Consumes: `s.taken: boolean` — campo del tipo `Slot` de Supabase.
- Produce: badge rojo con texto "Agendada" cuando `s.taken === true`.

- [ ] **Step 1: Localizar el badge**

  En `src/routes/app.ips.calendario.tsx`, buscar la línea que contiene `{s.taken ? "Ocupado" : "Disponible"}` (aproximadamente línea 118).

- [ ] **Step 2: Actualizar variant y texto**

  Reemplazar:
  ```tsx
  <Badge variant={s.taken ? "secondary" : "default"}>
    {s.taken ? "Ocupado" : "Disponible"}
  </Badge>
  ```

  Con:
  ```tsx
  <Badge variant={s.taken ? "destructive" : "default"}>
    {s.taken ? "Agendada" : "Disponible"}
  </Badge>
  ```

- [ ] **Step 3: Verificar que TypeScript compila**

  ```powershell
  npx tsc --noEmit
  ```

  Esperado: sin errores nuevos.

- [ ] **Step 4: Verificación visual en el navegador**

  1. Iniciar el servidor de desarrollo: `npm run dev`
  2. Ingresar como IPS al calendario (`/app/ips/calendario`).
  3. Seleccionar una fecha que tenga slots tomados (`taken: true` en Supabase).
  4. Verificar que el badge muestre "Agendada" en rojo (destructive).
  5. Verificar que slots libres sigan mostrando "Disponible" en verde/primary.
  6. Ingresar como empresa o particular, seleccionar esa misma IPS.
  7. Verificar que los slots tomados NO aparecen en la grilla de horarios disponibles.

- [ ] **Step 5: Commit**

  ```powershell
  git add src/routes/app.ips.calendario.tsx
  git commit -m "feat: show 'Agendada' badge (destructive) for taken slots in IPS calendar"
  ```
