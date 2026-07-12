// Subset of Colombian departments and their main cities with approximate coords.
export interface Ciudad {
  nombre: string;
  lat: number;
  lng: number;
}
export interface Departamento {
  nombre: string;
  ciudades: Ciudad[];
}

export const DEPARTAMENTOS: Departamento[] = [
  {
    nombre: "Cundinamarca",
    ciudades: [
      { nombre: "Bogotá", lat: 4.711, lng: -74.0721 },
      { nombre: "Soacha", lat: 4.5875, lng: -74.2148 },
      { nombre: "Chía", lat: 4.8583, lng: -74.0586 },
    ],
  },
  {
    nombre: "Antioquia",
    ciudades: [
      { nombre: "Medellín", lat: 6.2442, lng: -75.5812 },
      { nombre: "Envigado", lat: 6.1701, lng: -75.5836 },
      { nombre: "Bello", lat: 6.3373, lng: -75.5583 },
    ],
  },
  {
    nombre: "Valle del Cauca",
    ciudades: [
      { nombre: "Cali", lat: 3.4516, lng: -76.532 },
      { nombre: "Palmira", lat: 3.5394, lng: -76.3036 },
      { nombre: "Buenaventura", lat: 3.8801, lng: -77.0313 },
    ],
  },
  {
    nombre: "Atlántico",
    ciudades: [
      { nombre: "Barranquilla", lat: 10.9685, lng: -74.7813 },
      { nombre: "Soledad", lat: 10.9179, lng: -74.7647 },
    ],
  },
  {
    nombre: "Santander",
    ciudades: [
      { nombre: "Bucaramanga", lat: 7.1193, lng: -73.1227 },
      { nombre: "Floridablanca", lat: 7.0651, lng: -73.0862 },
    ],
  },
  {
    nombre: "Bolívar",
    ciudades: [{ nombre: "Cartagena", lat: 10.391, lng: -75.4794 }],
  },
  {
    nombre: "Risaralda",
    ciudades: [{ nombre: "Pereira", lat: 4.8133, lng: -75.6961 }],
  },
];

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
