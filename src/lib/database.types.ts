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
          servicio: string
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
          fecha: string
          hora: string
          ciudad: string
          servicio: string
          estado: 'pendiente_pago' | 'agendada' | 'atendida' | 'cancelada' | 'expirada'
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['appointments']['Row'], 'id' | 'created_at' | 'estado'>
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
      clasificaciones: {
        Row: { id: string; nombre: string; created_at: string }
        Insert: { nombre: string }
        Update: Partial<{ nombre: string }>
      }
      servicios: {
        Row: { id: string; nombre: string; clasificacion_id: string | null; created_at: string }
        Insert: { nombre: string; clasificacion_id?: string | null }
        Update: Partial<{ nombre: string; clasificacion_id: string | null }>
      }
      tipos_examen: {
        Row: { id: string; nombre: string; roles_permitidos: string[]; created_at: string }
        Insert: { nombre: string; roles_permitidos?: string[] }
        Update: Partial<{ nombre: string; roles_permitidos: string[] }>
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
export type Clasificacion = Database['public']['Tables']['clasificaciones']['Row']
export type TipoExamen = Database['public']['Tables']['tipos_examen']['Row']

export type Servicio = {
  id: string
  nombre: string
  clasificacion_id: string | null
  clasificacion: { id: string; nombre: string } | null
  created_at: string
}
