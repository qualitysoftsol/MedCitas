import { readSheet } from "read-excel-file/browser";
import writeXlsxFile from "write-excel-file/browser";
import type { Cargo, TipoDoc } from "@/lib/database.types";
import { errorCelular, errorCorreo, errorDocumento } from "@/lib/hooks/useEmpresa";

// Archivo de empleados para agendar en lote (.xlsx o .csv): una fila por empleado.

type Campo = "tipo_doc" | "numero" | "nombres" | "apellidos" | "cargo" | "celular" | "correo" | "fecha_retiro";

/** Columnas de la plantilla, en orden, y otros encabezados que se aceptan. */
const COLUMNAS: { campo: Campo; titulo: string; alias: string[]; requerida: boolean }[] = [
  { campo: "tipo_doc", titulo: "Tipo doc", alias: ["tipo doc", "tipo de documento", "tipo documento", "tipo"], requerida: false },
  { campo: "numero", titulo: "Número", alias: ["numero", "numero de documento", "documento", "cedula", "identificacion"], requerida: true },
  { campo: "nombres", titulo: "Nombres", alias: ["nombres", "nombre"], requerida: true },
  { campo: "apellidos", titulo: "Apellidos", alias: ["apellidos", "apellido"], requerida: true },
  { campo: "cargo", titulo: "Cargo", alias: ["cargo"], requerida: true },
  { campo: "celular", titulo: "Celular", alias: ["celular", "telefono", "movil"], requerida: false },
  { campo: "correo", titulo: "Correo", alias: ["correo", "email", "correo electronico", "e mail"], requerida: false },
  { campo: "fecha_retiro", titulo: "Fecha de retiro", alias: ["fecha de retiro", "fecha retiro"], requerida: false },
];

const TIPOS: Record<string, TipoDoc> = {
  cc: "CC", "cedula de ciudadania": "CC", ce: "CE", "cedula de extranjeria": "CE", ti: "TI", "tarjeta de identidad": "TI",
  pa: "PA", pasaporte: "PA", ppt: "PPT", "permiso por proteccion temporal": "PPT",
};

/** Minúsculas, sin tildes ni signos, espacios simples. */
export const normalizar = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

export interface FilaArchivo {
  /** Número de fila en el archivo (la 1 es el encabezado). */
  fila: number;
  tipo_doc: string;
  numero: string;
  nombres: string;
  apellidos: string;
  cargo: string;
  celular: string;
  correo: string;
  /** 'YYYY-MM-DD' si se pudo leer; si no, el texto original. */
  fecha_retiro: string;
}

export interface ArchivoLeido { nombre: string; columnas: string[]; filas: FilaArchivo[] }

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const esIso = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T00:00:00`).getTime());

/** Celda a texto. Las fechas llegan como Date (UTC), número de serie de Excel o texto dd/mm/aaaa. */
function texto(v: unknown, fecha = false): string {
  if (v == null) return "";
  if (v instanceof Date) return iso(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  if (typeof v === "number") {
    if (fecha && v > 20000 && v < 80000) {
      const d = new Date(Math.round((v - 25569) * 86_400_000));
      return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    }
    return String(v);
  }
  const s = String(v).trim();
  if (fecha) {
    const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    if (m) return iso(Number(m[3]), Number(m[2]), Number(m[1]));
  }
  return s;
}

/** CSV sencillo: separador ; o , (el que más aparezca en el encabezado) y comillas dobles. */
function leerCsv(contenido: string): unknown[][] {
  const lineas = contenido.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lineas.length === 0) return [];
  const sep = (lineas[0].match(/;/g)?.length ?? 0) >= (lineas[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  return lineas.map((linea) => {
    const celdas: string[] = [];
    let actual = "";
    let comillas = false;
    for (let i = 0; i < linea.length; i++) {
      const ch = linea[i];
      if (ch === '"') {
        if (comillas && linea[i + 1] === '"') { actual += '"'; i++; } else comillas = !comillas;
      } else if (ch === sep && !comillas) { celdas.push(actual); actual = ""; } else actual += ch;
    }
    celdas.push(actual);
    return celdas;
  });
}

export class ArchivoError extends Error {}

export async function leerArchivo(file: File): Promise<ArchivoLeido> {
  let filas: unknown[][];
  if (/\.xlsx$/i.test(file.name)) {
    try {
      filas = (await readSheet(file)) as unknown[][];
    } catch {
      throw new ArchivoError("No pudimos leer el archivo de Excel. Revisa que sea .xlsx y no esté protegido.");
    }
  } else if (/\.csv$/i.test(file.name)) {
    filas = leerCsv(await file.text());
  } else {
    throw new ArchivoError("El archivo debe ser .xlsx o .csv. Descarga la plantilla para ver el formato.");
  }

  const iEncabezado = filas.findIndex((f) => f.some((c) => c != null && String(c).trim()));
  if (iEncabezado < 0) throw new ArchivoError("El archivo está vacío.");
  const encabezado = filas[iEncabezado].map((c) => normalizar(String(c ?? "")));
  const indice = new Map<Campo, number>();
  COLUMNAS.forEach((col) => {
    const i = encabezado.findIndex((h) => col.alias.includes(h));
    if (i >= 0) indice.set(col.campo, i);
  });
  const faltan = COLUMNAS.filter((c) => c.requerida && !indice.has(c.campo)).map((c) => c.titulo);
  if (faltan.length) throw new ArchivoError(`Faltan las columnas: ${faltan.join(", ")}. Descarga la plantilla para ver el formato.`);

  const leidas: FilaArchivo[] = [];
  filas.slice(iEncabezado + 1).forEach((celdas, n) => {
    const get = (c: Campo) => (indice.has(c) ? texto(celdas[indice.get(c)!], c === "fecha_retiro") : "");
    const fila: FilaArchivo = {
      fila: iEncabezado + n + 2,
      tipo_doc: get("tipo_doc"), numero: get("numero").replace(/[\s.]/g, ""), nombres: get("nombres"), apellidos: get("apellidos"),
      cargo: get("cargo"), celular: get("celular").replace(/\s/g, ""), correo: get("correo"), fecha_retiro: get("fecha_retiro"),
    };
    // Filas en blanco al final del archivo.
    if (Object.entries(fila).some(([k, v]) => k !== "fila" && v)) leidas.push(fila);
  });
  if (leidas.length === 0) throw new ArchivoError("El archivo no tiene empleados debajo del encabezado.");

  return { nombre: file.name, columnas: COLUMNAS.filter((c) => indice.has(c.campo)).map((c) => c.titulo), filas: leidas };
}

// ─── Validación ──────────────────────────────────────────────────────────────

export interface FilaValidada extends FilaArchivo {
  tipoDoc: TipoDoc | null;
  cargoObj: Cargo | null;
  /** Mensajes para el usuario; vacío = lista para agendar. */
  errores: string[];
  /** El cargo no existe en Cargos: se resuelve eligiendo uno o creándolo. */
  cargoDesconocido: boolean;
  /** Fila anterior con el mismo documento. */
  repetidaDe: number | null;
}

/**
 * Valida cada fila. `mapeo` traduce un cargo del archivo (normalizado) a uno de
 * Cargos: así "Bodeguero" se resuelve una vez para todas sus filas.
 */
export function validarFilas(filas: FilaArchivo[], cargos: Cargo[], codigo: string, mapeo: Record<string, string>): FilaValidada[] {
  const vistos = new Map<string, number>();
  return filas.map((f) => {
    const errores: string[] = [];
    const tipoDoc = f.tipo_doc ? TIPOS[normalizar(f.tipo_doc)] ?? null : "CC";
    if (!tipoDoc) errores.push(`Tipo de documento «${f.tipo_doc}» no válido (usa CC, CE, TI, PA o PPT).`);
    const errDoc = errorDocumento(tipoDoc ?? "CC", f.numero);
    if (errDoc) errores.push(errDoc);
    if (!f.nombres) errores.push("Faltan los nombres.");
    if (!f.apellidos) errores.push("Faltan los apellidos.");

    const clave = normalizar(f.cargo);
    const cargoObj = cargos.find((c) => c.id === mapeo[clave]) ?? cargos.find((c) => normalizar(c.nombre) === clave) ?? null;
    const cargoDesconocido = !!f.cargo && !cargoObj;
    if (!f.cargo) errores.push("Falta el cargo.");
    else if (cargoDesconocido) errores.push(`El cargo «${f.cargo}» no existe.`);
    else if (cargoObj && cargoObj.enfasis_ids.length === 0) errores.push(`El cargo «${cargoObj.nombre}» no tiene énfasis.`);

    const errCel = errorCelular(f.celular);
    if (errCel) errores.push(errCel);
    const errCorreo = errorCorreo(f.correo);
    if (errCorreo) errores.push(errCorreo);
    if (codigo === "EGRESO" && !esIso(f.fecha_retiro)) errores.push(f.fecha_retiro ? `Fecha de retiro «${f.fecha_retiro}» no válida (usa dd/mm/aaaa).` : "Falta la fecha de retiro.");

    const repetidaDe = f.numero ? vistos.get(f.numero) ?? null : null;
    if (repetidaDe != null) errores.push(`Documento repetido (fila ${repetidaDe}).`);
    else if (f.numero) vistos.set(f.numero, f.fila);

    return { ...f, tipoDoc, cargoObj, errores, cargoDesconocido, repetidaDe };
  });
}

// ─── Descargas ───────────────────────────────────────────────────────────────

const ENCABEZADO = COLUMNAS.map((c) => ({ value: c.titulo, fontWeight: "bold" as const }));
const ANCHOS = [{ width: 10 }, { width: 16 }, { width: 22 }, { width: 22 }, { width: 28 }, { width: 14 }, { width: 28 }, { width: 16 }];

export async function descargarPlantilla(egreso: boolean) {
  await writeXlsxFile(
    [
      ENCABEZADO,
      ["CC", "1020345678", "Laura", "Méndez", "Operario de montacargas", "3001234567", "laura@correo.com", egreso ? "30/11/2026" : ""],
      ["CE", "456789", "Andrés", "Gómez", "Conductor", "", "", egreso ? "30/11/2026" : ""],
    ],
    { columns: ANCHOS, sheet: "Empleados" },
  ).toFile("plantilla-empleados.xlsx");
}

/** Las filas con error y su motivo, para corregirlas y cargarlas después. */
export async function descargarErrores(filas: FilaValidada[], nombreArchivo: string) {
  await writeXlsxFile(
    [
      [...ENCABEZADO, { value: "Motivo", fontWeight: "bold" as const }],
      ...filas.map((f) => [f.tipo_doc, f.numero, f.nombres, f.apellidos, f.cargo, f.celular, f.correo, f.fecha_retiro, f.errores.join(" ")]),
    ],
    { columns: [...ANCHOS, { width: 50 }], sheet: "Por corregir" },
  ).toFile(`por-corregir-${nombreArchivo.replace(/\.(xlsx|csv)$/i, "")}.xlsx`);
}
