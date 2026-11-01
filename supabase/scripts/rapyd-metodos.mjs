// Lista los medios de pago de Rapyd disponibles en Colombia para tu cuenta y
// sugiere el valor del secreto RAPYD_PAYMENT_METHODS: solo los que se
// confirman al instante (is_online) y admiten reembolso (is_refundable).
//
// Uso (PowerShell):
//   $env:RAPYD_ACCESS_KEY="..."; $env:RAPYD_SECRET_KEY="..."; node supabase/scripts/rapyd-metodos.mjs
// Por defecto usa el sandbox; para producción define RAPYD_BASE_URL=https://api.rapyd.net
import crypto from "node:crypto";

const accessKey = process.env.RAPYD_ACCESS_KEY;
const secretKey = process.env.RAPYD_SECRET_KEY;
const baseUrl = process.env.RAPYD_BASE_URL ?? "https://sandboxapi.rapyd.net";
if (!accessKey || !secretKey) {
  console.error("Define RAPYD_ACCESS_KEY y RAPYD_SECRET_KEY en el entorno.");
  process.exit(1);
}

// Misma firma que supabase/functions/_shared/rapyd.ts
const path = "/v1/payment_methods/countries/CO?currency=COP";
const salt = crypto.randomBytes(8).toString("hex");
const timestamp = Math.floor(Date.now() / 1000).toString();
const hex = crypto.createHmac("sha256", secretKey).update("get" + path + salt + timestamp + accessKey + secretKey).digest("hex");
const signature = Buffer.from(hex).toString("base64");

const res = await fetch(baseUrl + path, { headers: { access_key: accessKey, salt, timestamp, signature } });
const json = await res.json();
if (json?.status?.status !== "SUCCESS") {
  console.error("Rapyd respondió con error:", json?.status?.error_code, json?.status?.message);
  process.exit(1);
}

const filas = json.data.map((m) => ({
  tipo: m.type,
  nombre: m.name,
  categoria: m.category,
  al_instante: m.is_online,
  reembolsable: m.is_refundable,
}));
console.table(filas);

const sugeridos = json.data.filter((m) => m.is_online && m.is_refundable && m.category !== "cash").map((m) => m.type);
console.log("\nRAPYD_PAYMENT_METHODS sugerido:");
console.log(sugeridos.join(",") || "(ninguno cumple: revisa la configuración de tu cuenta con Rapyd)");
