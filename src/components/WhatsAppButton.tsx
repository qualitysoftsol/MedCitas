import { useState } from "react";

interface WhatsAppButtonProps {
  /** Código de país + número, solo dígitos, sin + ni espacios (ej. "573001234567") */
  phoneNumber?: string;
  /** Mensaje precargado en el chat, editable por el usuario antes de enviar */
  message?: string;
}

/**
 * Botón flotante que redirige a un chat de WhatsApp.
 * Usa el endpoint público wa.me — no requiere API de WhatsApp Business ni backend.
 *
 * Uso:
 *   <WhatsAppButton phoneNumber="573001234567" message="Hola, quiero agendar una cita" />
 */
export default function WhatsAppButton({
  phoneNumber = "573203744639",
  message = "Hola, deseo obtener información",
}: WhatsAppButtonProps) {
  const [hovered, setHovered] = useState<boolean>(false);

  const cleanNumber: string = phoneNumber.replace(/\D/g, "");
  const whatsappUrl: string = `https://wa.me/${cleanNumber}?text=${encodeURIComponent(message)}`;

  return (
    <a
      href={whatsappUrl}
      target="_blank"
      rel="noopener noreferrer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label="Chatear por WhatsApp"
      className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-3 text-white shadow-lg transition-transform"
      style={{ transform: hovered ? "scale(1.06)" : "scale(1)" }}
    >
      <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
        <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.79.47 3.47 1.29 4.93L2 22l5.29-1.39a9.87 9.87 0 0 0 4.75 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm5.8 14.03c-.24.68-1.4 1.3-1.93 1.38-.5.08-1.12.11-1.8-.11-.42-.13-.96-.31-1.65-.61-2.91-1.26-4.81-4.18-4.96-4.37-.14-.19-1.19-1.58-1.19-3.02s.75-2.14 1.02-2.43c.26-.29.57-.36.76-.36h.55c.18 0 .42-.02.63.49.24.58.82 2 .89 2.14.07.15.11.32.02.51-.09.19-.14.31-.28.47-.14.16-.29.36-.42.48-.14.13-.28.28-.12.55.16.28.72 1.2 1.55 1.95 1.07.96 1.96 1.26 2.24 1.4.28.14.44.12.61-.07.16-.19.7-.82.89-1.1.19-.28.37-.23.62-.14.26.09 1.63.77 1.91.91.28.14.47.21.53.32.07.12.07.66-.17 1.31z" />
      </svg>
      <span className="hidden text-sm font-medium sm:inline">Escríbenos</span>
    </a>
  );
}
