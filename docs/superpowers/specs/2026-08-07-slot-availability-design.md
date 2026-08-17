# Spec: Disponibilidad de slots — impedir re-agendamiento y mostrar "Agendada" en IPS

**Fecha:** 2026-08-07  
**Rama:** feat/servicios

---

## Problema

Cuando una cita es agendada por una empresa o un particular:
1. El slot marcado `taken: true` puede seguir apareciendo disponible en la vista de agendamiento si la caché de React Query no se ha invalidado o refrescado.
2. El calendario de la IPS muestra el badge "Ocupado" en lugar de "Agendada", y no invalida su caché cuando una cita es agendada por un tercero.

---

## Solución (Enfoque A)

Tres cambios quirúrgicos, sin nuevas dependencias ni reestructuración.

---

### Cambio 1 — `useAvailableSlots` siempre trae datos frescos

**Archivo:** `src/lib/hooks/useSlots.ts`

Agregar `staleTime: 0` y `refetchOnMount: 'always'` al query de `useAvailableSlots`.

- `staleTime: 0`: React Query nunca considera estos datos "frescos"; siempre los marca como stale al siguiente render.
- `refetchOnMount: 'always'`: fuerza un fetch desde Supabase cada vez que el componente que usa este hook monta, independientemente del estado de la caché.

**Resultado:** empresa y particular siempre ven horarios actualizados al abrir o navegar a la vista de agendamiento.

---

### Cambio 2 — Invalidar también `['slots', ipsId]` al agendar

**Archivo:** `src/lib/hooks/useAppointments.ts`

**`useBookAppointment.onSuccess`** — agregar:
```ts
qc.invalidateQueries({ queryKey: ['slots', variables.ips_id] })
```

**`useBookAppointmentsBatch.onSuccess`** — agregar:
```ts
if (ipsId) qc.invalidateQueries({ queryKey: ['slots', ipsId] })
```

`['slots', ipsId]` es el query key que usa `useSlots(profile?.id)` en el calendario IPS. Sin esta invalidación, el calendario IPS no actualiza su caché cuando un tercero agenda un slot.

---

### Cambio 3 — Badge "Agendada" en el calendario IPS

**Archivo:** `src/routes/app.ips.calendario.tsx`

```tsx
// Antes
<Badge variant={s.taken ? "secondary" : "default"}>
  {s.taken ? "Ocupado" : "Disponible"}
</Badge>

// Después
<Badge variant={s.taken ? "destructive" : "default"}>
  {s.taken ? "Agendada" : "Disponible"}
</Badge>
```

`variant="destructive"` usa el color rojo del sistema de diseño, dejando claro visualmente que el horario ya no está libre.

---

## Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/lib/hooks/useSlots.ts` | `staleTime: 0`, `refetchOnMount: 'always'` en `useAvailableSlots` |
| `src/lib/hooks/useAppointments.ts` | Invalidar `['slots', ipsId]` en `useBookAppointment` y `useBookAppointmentsBatch` |
| `src/routes/app.ips.calendario.tsx` | Badge `"Ocupado"` → `"Agendada"`, variant `"secondary"` → `"destructive"` |

---

## Comportamiento esperado tras los cambios

- **empresa/particular:** Al abrir la vista de solicitud de cita, los slots tomados no aparecen. Tras agendar, el slot desaparece de la grilla inmediatamente (caché invalidada).
- **IPS calendario:** Los slots agendados muestran badge rojo "Agendada". Si el calendario está abierto cuando alguien agenda, el badge se actualiza al refetch automático.
- **Cancelación:** Al cancelar, el slot vuelve a `taken: false`; `useCancelAppointment` ya invalida `['slots']` (todos los slots), por lo que ambas vistas se actualizan correctamente. Sin cambios necesarios aquí.

---

## Fuera de alcance

- Prevención de race conditions entre dos usuarios concurrentes que ven el mismo slot (requeriría Supabase Realtime — Enfoque B, descartado).
- Mostrar información del paciente en el calendario IPS (fuera del alcance de esta solicitud).
