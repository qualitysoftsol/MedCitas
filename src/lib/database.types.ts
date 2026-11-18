export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          role: 'admin' | 'ips' | 'empresa' | 'particular'
          nombre: string
          telefono: string | null
          direccion: string | null
          descripcion: string | null
          nit: string | null
          cedula: string | null
          departamento: string | null
          ciudad: string | null
          lat: number | null
          lng: number | null
          rut_url: string | null
          camara_comercio_url: string | null
          contacto_rrhh_telefono: string | null
          contacto_rrhh_email: string | null
          contacto_contabilidad_telefono: string | null
          contacto_contabilidad_email: string | null
          servicios: string[] | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'created_at'>
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
      }
      ips_fotos: {
        Row: {
          id: string
          ips_id: string
          url: string
          orden: number
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['ips_fotos']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['ips_fotos']['Insert']>
      }
      slots: {
        Row: {
          id: string
          ips_id: string
          fecha: string
          hora: string
          /** null = cupo para cualquier evaluación (migración 020). Los horarios antiguos conservan su servicio. */
          servicio: string | null
          ciudad: string
          taken: boolean
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['slots']['Row'], 'id' | 'created_at' | 'taken'>
        Update: Partial<Database['public']['Tables']['slots']['Row']>
      }
      appointments: {
        Row: {
          id: string
          slot_id: string
          ips_id: string
          solicitante_id: string
          empleado_nombre: string
          empleado_cedula: string
          tipo_examen: string
          /** Código del tipo de evaluación (migración 019). Si no se envía, lo completa un trigger desde tipo_examen. */
          tipo_evaluacion: string | null
          fecha: string
          hora: string
          ciudad: string
          /** Resumen de las pruebas de la cita ("Evaluación médica ocupacional, Audiometría"). */
          servicio: string
          estado: 'pendiente_pago' | 'agendada' | 'atendida' | 'cancelada' | 'expirada'
          /** Datos que pide el tipo de evaluación (migración 020). */
          datos_evaluacion: Record<string, unknown>
          /** Nombres de los énfasis al momento de agendar. */
          enfasis: string[] | null
          cargo: string | null
          created_at: string
        }
        // Se crean con las funciones agendar_cita_empresa, agendar_lote_empresa y crear_cita_interna.
        Insert: never
        Update: Partial<Database['public']['Tables']['appointments']['Row']>
      }
      resultados: {
        Row: {
          id: string
          appointment_id: string
          solicitante_id: string
          ips_id: string
          empleado_nombre: string
          empleado_cedula: string
          fecha: string
          diagnostico: string
          apto: 'apto' | 'apto_restricciones' | 'no_apto'
          observaciones: string
          pdf_url: string
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['resultados']['Row'], 'id' | 'created_at' | 'pdf_url'> & { pdf_url?: string }
        Update: Partial<Database['public']['Tables']['resultados']['Row']>
      }
      notifications: {
        Row: {
          id: string
          user_id: string
          tipo: 'cita_agendada' | 'cita_cancelada' | 'resultado_cargado'
          titulo: string
          mensaje: string
          read: boolean
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['notifications']['Row'], 'id' | 'created_at' | 'read'>
        Update: Partial<Database['public']['Tables']['notifications']['Row']>
      }
      // Catálogos de evaluación (migración 019).
      lineas_servicio: {
        Row: { id: string; nombre: string; descripcion: string | null; activo: boolean; created_at: string }
        Insert: { nombre: string; descripcion?: string | null; activo?: boolean }
        Update: Partial<{ nombre: string; descripcion: string | null; activo: boolean }>
      }
      servicios: {
        Row: {
          id: string
          nombre: string
          tipo: TipoServicio | null
          preparacion: string | null
          indicaciones: string | null
          duracion_min: number | null
          created_at: string
        }
        // Se escriben con la función guardar_servicio, que también guarda las líneas.
        Insert: never
        Update: never
      }
      servicio_lineas: {
        Row: { servicio_id: string; linea_id: string }
        Insert: { servicio_id: string; linea_id: string }
        Update: never
      }
      tipos_evaluacion: {
        Row: {
          id: string
          codigo: string
          nombre: string
          descripcion: string | null
          regla: string | null
          indicaciones: string | null
          roles_permitidos: string[]
          orden: number | null
          created_at: string
        }
        // Fijos: solo se actualizan.
        Insert: never
        Update: Partial<{ nombre: string; descripcion: string | null; regla: string | null; indicaciones: string | null; roles_permitidos: string[] }>
      }
      enfasis: {
        Row: { id: string; nombre: string; exclusivo: boolean; orden: number | null; created_at: string }
        Insert: { nombre: string; exclusivo?: boolean; orden?: number | null }
        Update: Partial<{ nombre: string; exclusivo: boolean; orden: number | null }>
      }
      enfasis_servicios: {
        Row: { enfasis_id: string; servicio_id: string }
        Insert: { enfasis_id: string; servicio_id: string }
        Update: never
      }
      precios_ips: {
        Row: { ips_id: string; servicio_id: string; precio: number; updated_at: string }
        Insert: { ips_id: string; servicio_id: string; precio: number; updated_at?: string }
        Update: Partial<{ precio: number; updated_at: string }>
      }
      comisiones: {
        Row: {
          id: string
          ips_id: string | null
          servicio_id: string | null
          rol: 'empresa' | 'particular' | null
          porcentaje: number
          created_at: string
        }
        Insert: { ips_id?: string | null; servicio_id?: string | null; rol?: 'empresa' | 'particular' | null; porcentaje: number }
        Update: Partial<{ porcentaje: number }>
      }
      // Pagos, reembolsos, facturas y liquidaciones (migración 018): el navegador
      // solo los lee; los escriben las Edge Functions y las funciones SQL.
      pagos: {
        Row: {
          id: string
          appointment_id: string
          solicitante_id: string
          monto: number
          moneda: string
          estado: 'pendiente' | 'aprobado' | 'rechazado' | 'expirado'
          expira_at: string
          rapyd_checkout_id: string | null
          rapyd_payment_id: string | null
          metodo: string | null
          detalle: string | null
          aprobado_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: never
        Update: never
      }
      reembolsos: {
        Row: {
          id: string
          pago_id: string
          monto: number
          motivo: string
          estado: 'solicitado' | 'en_proceso' | 'completado' | 'fallido' | 'denegado'
          rapyd_refund_id: string | null
          detalle: string | null
          resuelto_por: string | null
          created_at: string
          updated_at: string
        }
        Insert: never
        Update: never
      }
      facturas_empresa: {
        Row: {
          id: string
          empresa_id: string
          periodo: string
          num_citas: number
          total: number
          estado: 'pendiente' | 'pagada'
          numero: string | null
          pdf_path: string | null
          pagada_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: never
        Update: Partial<{ estado: 'pendiente' | 'pagada'; numero: string | null; pdf_path: string | null; pagada_at: string | null; updated_at: string }>
      }
      facturas_empresa_items: {
        Row: { appointment_id: string; factura_id: string; valor: number }
        Insert: never
        Update: never
      }
      liquidaciones_ips: {
        Row: {
          id: string
          ips_id: string
          periodo: string
          num_citas: number
          total: number
          estado: 'pendiente' | 'pagada'
          pagada_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: never
        Update: Partial<{ estado: 'pendiente' | 'pagada'; pagada_at: string | null; updated_at: string }>
      }
      liquidaciones_ips_items: {
        Row: { appointment_id: string; liquidacion_id: string; valor: number }
        Insert: never
        Update: never
      }
    }
  }
}

export type Profile = Database['public']['Tables']['profiles']['Row']
export type IpsFoto = Database['public']['Tables']['ips_fotos']['Row']
export type Slot = Database['public']['Tables']['slots']['Row']
export type Appointment = Database['public']['Tables']['appointments']['Row']
export type Resultado = Database['public']['Tables']['resultados']['Row']
export type Notification = Database['public']['Tables']['notifications']['Row']
export type PrecioIps = Database['public']['Tables']['precios_ips']['Row']
export type Comision = Database['public']['Tables']['comisiones']['Row']
export type Pago = Database['public']['Tables']['pagos']['Row']
export type Reembolso = Database['public']['Tables']['reembolsos']['Row']
export type FacturaEmpresa = Database['public']['Tables']['facturas_empresa']['Row']
export type LiquidacionIps = Database['public']['Tables']['liquidaciones_ips']['Row']
export type LineaServicio = Database['public']['Tables']['lineas_servicio']['Row']
export type TipoEvaluacion = Database['public']['Tables']['tipos_evaluacion']['Row']

export type TipoServicio = 'evaluacion_medica' | 'prueba_complementaria' | 'imagen' | 'terapia'

/** Servicio con sus líneas (useServicios). */
export type Servicio = Database['public']['Tables']['servicios']['Row'] & {
  lineas: Pick<LineaServicio, 'id' | 'nombre' | 'activo'>[]
}

/** Énfasis con los servicios (pruebas) que suma (useEnfasis). */
export type Enfasis = Database['public']['Tables']['enfasis']['Row'] & {
  servicio_ids: string[]
}
