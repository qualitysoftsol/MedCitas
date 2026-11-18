import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Logo } from "@/components/app/Logo";

// Política de tratamiento de datos personales (Ley 1581 de 2012 y Decreto 1377 de
// 2013, compilado en el Decreto 1074 de 2015). Los textos entre corchetes los
// completa el responsable antes de publicar. Debe revisarla un abogado.
export const Route = createFileRoute("/politica-datos")({
  head: () => ({
    meta: [
      { title: "Política de tratamiento de datos — MedCitas" },
      { name: "description", content: "Cómo MedCitas recolecta, usa y protege tus datos personales." },
    ],
  }),
  component: PoliticaDatos,
});

const RESPONSABLE = {
  razonSocial: "[RAZÓN SOCIAL]",
  nit: "[NIT]",
  direccion: "[DIRECCIÓN]",
  ciudad: "[CIUDAD]",
  correo: "[CORREO DE PROTECCIÓN DE DATOS]",
  telefono: "[TELÉFONO]",
  vigencia: "[FECHA DE VIGENCIA]",
};

function Seccion({ n, titulo, children }: { n: number; titulo: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`s${n}`} className="space-y-2">
      <h2 id={`s${n}`} className="text-lg font-semibold">{n}. {titulo}</h2>
      <div className="space-y-2 text-[15px] leading-relaxed text-foreground/90">{children}</div>
    </section>
  );
}

function PoliticaDatos() {
  const r = RESPONSABLE;
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link to="/" aria-label="Ir al inicio de MedCitas"><Logo /></Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-8 px-4 py-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Política de tratamiento de datos personales</h1>
          <p className="mt-2 text-sm text-muted-foreground">Vigente desde {r.vigencia}.</p>
        </div>

        <Seccion n={1} titulo="Responsable del tratamiento">
          <p>
            {r.razonSocial}, identificada con NIT {r.nit}, con domicilio en {r.direccion}, {r.ciudad} (Colombia), es la
            responsable del tratamiento de los datos personales que se recolectan en la plataforma MedCitas.
          </p>
          <p>Contacto para temas de datos personales: {r.correo} · {r.telefono}.</p>
        </Seccion>

        <Seccion n={2} titulo="Qué es MedCitas y qué datos tratamos">
          <p>
            MedCitas conecta a personas y empresas con instituciones prestadoras de servicios de salud (IPS) para agendar
            evaluaciones médicas ocupacionales. Para hacerlo tratamos:
          </p>
          <ul className="list-disc space-y-1 pl-6">
            <li><strong>Datos de identificación y contacto:</strong> nombre, número de documento, teléfono, correo y dirección.</li>
            <li><strong>Datos de la evaluación:</strong> tipo de evaluación, cargo, empresa, riesgos del cargo (énfasis), y fechas relacionadas, como las de incapacidad, ausencia o retiro.</li>
            <li><strong>Datos de la cita y del pago:</strong> IPS, fecha, hora, pruebas, valor y estado del pago. Los datos de tarjetas o cuentas los recibe directamente la pasarela de pagos; MedCitas no los almacena.</li>
            <li><strong>Resultados:</strong> el certificado de aptitud, el concepto (apto, apto con restricciones o no apto) y las observaciones que la IPS carga en la plataforma.</li>
          </ul>
        </Seccion>

        <Seccion n={3} titulo="Datos sensibles">
          <p>
            Las fechas de incapacidad, los conceptos de aptitud y los resultados de las evaluaciones son datos relativos a
            la salud y, por lo tanto, datos sensibles. No estás obligado a autorizar su tratamiento; sin embargo, sin ellos
            no es posible agendar ni entregar la evaluación.
          </p>
          <p>
            La historia clínica ocupacional completa la conserva la IPS que te atiende, bajo reserva y conforme a las normas
            de historia clínica. MedCitas no tiene acceso a ella. A quien solicitó tu evaluación (tú o la empresa que te
            envía) se le entregan los resultados que la IPS carga en la plataforma, nunca la historia clínica.
          </p>
        </Seccion>

        <Seccion n={4} titulo="Para qué usamos tus datos">
          <ul className="list-disc space-y-1 pl-6">
            <li>Agendar, confirmar, reprogramar y cancelar tus citas, y enviarte avisos e indicaciones para la cita.</li>
            <li>Compartir con la IPS que elijas los datos que necesita para atenderte.</li>
            <li>Procesar pagos, reembolsos y facturación.</li>
            <li>Entregar los resultados a quien solicitó la evaluación (tú o la empresa que te envía).</li>
            <li>Atender tus consultas y reclamos, y cumplir obligaciones legales.</li>
            <li>Elaborar estadísticas sin identificar a las personas, para mejorar el servicio.</li>
          </ul>
        </Seccion>

        <Seccion n={5} titulo="Con quién compartimos tus datos">
          <p>Solo con quienes los necesitan para las finalidades anteriores:</p>
          <ul className="list-disc space-y-1 pl-6">
            <li>La IPS que te atiende.</li>
            <li>La empresa que solicitó tu evaluación, cuando es el caso.</li>
            <li>
              Proveedores que prestan servicios a MedCitas como encargados del tratamiento: alojamiento y base de datos,
              envío de correos y pasarela de pagos. Algunos de ellos pueden estar fuera de Colombia; en ese caso exigimos
              que protejan los datos con un nivel de seguridad adecuado.
            </li>
            <li>Autoridades que lo soliciten en ejercicio de sus funciones legales.</li>
          </ul>
        </Seccion>

        <Seccion n={6} titulo="Tus derechos">
          <p>Como titular de los datos tienes derecho a:</p>
          <ul className="list-disc space-y-1 pl-6">
            <li>Conocer, actualizar y rectificar tus datos.</li>
            <li>Pedir prueba de la autorización que nos diste.</li>
            <li>Ser informado sobre el uso que les damos.</li>
            <li>Presentar quejas ante la Superintendencia de Industria y Comercio (SIC) por infracciones a la ley.</li>
            <li>Revocar la autorización o pedir que suprimamos tus datos, cuando no exista un deber legal o contractual de conservarlos.</li>
            <li>Acceder gratis a tus datos.</li>
          </ul>
        </Seccion>

        <Seccion n={7} titulo="Cómo ejercer tus derechos">
          <p>Escríbenos a {r.correo} indicando tu nombre, número de documento, lo que solicitas y un medio para responderte.</p>
          <ul className="list-disc space-y-1 pl-6">
            <li><strong>Consultas:</strong> las respondemos en máximo 10 días hábiles. Si no es posible, te avisamos el motivo y te respondemos en máximo 5 días hábiles más.</li>
            <li><strong>Reclamos</strong> (corrección, actualización, supresión o incumplimiento): los respondemos en máximo 15 días hábiles. Si no es posible, te avisamos el motivo y te respondemos en máximo 8 días hábiles más.</li>
          </ul>
          <p>Antes de acudir a la SIC debes haber presentado la consulta o el reclamo ante nosotros.</p>
        </Seccion>

        <Seccion n={8} titulo="Seguridad y conservación">
          <p>
            Protegemos tus datos con medidas técnicas y administrativas razonables: acceso restringido según el rol de cada
            usuario, conexiones cifradas y registro de los pagos. Conservamos los datos mientras sean necesarios para las
            finalidades descritas y durante los plazos que exige la ley.
          </p>
        </Seccion>

        <Seccion n={9} titulo="Cambios a esta política">
          <p>
            Si cambiamos esta política te lo informaremos en la plataforma antes de que el cambio aplique. Si el cambio
            afecta las finalidades, te pediremos una nueva autorización.
          </p>
        </Seccion>
      </main>
    </div>
  );
}
