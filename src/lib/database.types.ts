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
          estado: 'agendada' | 'atendida' | 'cancelada'
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
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['resultados']['Row'], 'id' | 'created_at'>
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
    }
  }
}

export type Profile = Database['public']['Tables']['profiles']['Row']
export type IpsFoto = Database['public']['Tables']['ips_fotos']['Row']
export type Slot = Database['public']['Tables']['slots']['Row']
export type Appointment = Database['public']['Tables']['appointments']['Row']
export type Resultado = Database['public']['Tables']['resultados']['Row']
export type Notification = Database['public']['Tables']['notifications']['Row']
export type Clasificacion = Database['public']['Tables']['clasificaciones']['Row']
export type TipoExamen = Database['public']['Tables']['tipos_examen']['Row']

export type Servicio = {
  id: string
  nombre: string
  clasificacion_id: string | null
  clasificacion: { id: string; nombre: string } | null
  created_at: string
}
