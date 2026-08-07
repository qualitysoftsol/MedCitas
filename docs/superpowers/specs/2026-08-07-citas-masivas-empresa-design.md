# Diseño: Cita Individual vs. Citas Masivas para Empresa

**Fecha:** 2026-08-07  
**Rama:** feat/servicios  
**Archivos afectados:** 2

---

## Contexto

La ruta `/app/empresa/solicitar` permite a una empresa agendar citas médicas ocupacionales para sus empleados. Actualmente solo soporta agendar una cita a la vez (un empleado, un slot). Se requiere agregar la opción de **citas masivas**: cargar un archivo de texto con múltiples empleados y agendar automáticamente un slot por cada uno.

---

## Decisiones de diseño

| Pregunta | Decisión |
|---|---|
| Enfoque UI | Tabs en la misma página (opción A) |
| Asignación de slots en masivo | Automática: un slot disponible por empleado, en orden |
| Formato del archivo | TXT separado por punto y coma: `Nombre;Cedula` por línea |
| Slots insuficientes | Vista previa con advertencia; la empresa decide si agenda parcialmente o cancela |

---

## Arquitectura

### Estado nuevo en el componente

```ts
modoSolicitud: 'individual' | 'masivo'     // controla el tab activo
archivoEmpleados: { nombre: string; cedula: string }[]  // empleados parseados
archivoError: string | null                // error de formato del archivo
```

El estado existente `selectedSlot` solo aplica en modo `individual`. En modo `masivo` no se usa.

### Flujo modo individual
Sin cambios respecto al comportamiento actual.

### Flujo modo masivo

1. Usuario carga archivo `.txt` con formato `Nombre;Cedula` (una entrada por línea).
2. El archivo se parsea en el cliente con `FileReader.readAsText()`:
   - Se descarta la primera línea si es cabecera (`nombre;cedula`, insensible a mayúsculas).
   - Cada línea se divide por `;` → `[nombre, cedula]`.
   - Líneas vacías o mal formadas se descartan con un contador de errores mostrado al usuario.
   - Si no hay ningún empleado válido, se muestra error y no se continúa.
3. Se muestra bajo el uploader una confirmación: "N empleados cargados: Juan Pérez, María Gómez...".
4. El resto del formulario (tipo de examen, departamento, ciudad, dirección, IPS) funciona igual.
5. Al elegir una IPS, se genera la **vista previa** (reemplaza la grilla de slots):
   - Se empareja `slotsIps[i]` con `archivoEmpleados[i]` en orden.
   - Tabla con columnas: `Empleado`, `Cédula`, `Horario asignado`.
   - Empleados sin slot disponible muestran "Sin horario disponible" en rojo.
   - Si hay empleados sin slot: aviso "Solo se agendarán X de Y empleados".
   - Si hay al menos un slot: botones `Agendar X citas` (solo las que tienen slot) | `Cancelar`.
   - Si hay 0 slots disponibles: mensaje "Esta IPS no tiene horarios disponibles" y no se muestra botón de agendar.
6. Al confirmar, se llama a `useBookAppointmentsBatch` con el array de citas.

---

## Cambios por archivo

### `src/routes/app.empresa.solicitar.tsx`

- Agregar estado `modoSolicitud`, `archivoEmpleados`, `archivoError`.
- Agregar toggle tabs "Cita individual / Citas masivas" al inicio de la tarjeta izquierda.
- En modo masivo: reemplazar campos Nombre+Cédula por `<input type="file" accept=".txt">` + lógica de parsing + lista de empleados cargados.
- En modo masivo: reemplazar grilla de slots por tabla de previsualización con auto-asignación.
- Función `submitMasivo()`: llama a `bookAppointmentsBatch.mutate(citas)`.
- Función `parsearArchivo(text: string)`: parsea el contenido del archivo y actualiza `archivoEmpleados`.

### `src/lib/hooks/useAppointments.ts`

- Agregar hook `useBookAppointmentsBatch`:

```ts
export function useBookAppointmentsBatch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (citas: BookData[]) => {
      const { error } = await supabase.from('appointments').insert(citas)
      if (error) throw error
      const slotIds = citas.map((c) => c.slot_id)
      const { error: slotError } = await supabase
        .from('slots')
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

---

## Manejo de errores

| Escenario | Comportamiento |
|---|---|
| Archivo vacío | Error: "El archivo no contiene empleados válidos" |
| Formato incorrecto | Error: "Formato inválido. Usa Nombre;Cedula por línea" |
| Algunas líneas mal formadas | Warning: "X líneas ignoradas por formato inválido" + continúa con las válidas |
| Slots insuficientes (parcial) | Vista previa con aviso; empresa decide si agenda parcialmente |
| 0 slots disponibles | Mensaje "Esta IPS no tiene horarios disponibles", sin botón de agendar |
| Error de red al agendar | `toast.error(err.message)`, ninguna cita se agenda (la mutación es atómica) |

---

## Lo que NO cambia

- Lógica de mapa e IPS list
- Hook `useAvailableSlots`
- Hook `useBookAppointment` (modo individual lo sigue usando)
- Rutas, navegación, sidebar
- Flujo de resultados, notificaciones, perfil
