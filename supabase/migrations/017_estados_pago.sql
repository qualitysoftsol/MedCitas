-- ============================================================
-- MedCitas — Migration 017: estados de cita para el pago en línea
-- Run in: Supabase Dashboard → SQL Editor → New query
--
-- Ejecuta este archivo solo, y después 018_pagos_facturacion.sql en otra
-- consulta: Postgres no permite usar un valor nuevo de un enum en la misma
-- transacción en que se crea.
--
--   pendiente_pago · el particular apartó el horario y tiene 30 min para pagar
--   expirada       · no pagó a tiempo; el horario quedó libre
-- ============================================================

ALTER TYPE appointment_estado ADD VALUE IF NOT EXISTS 'pendiente_pago';
ALTER TYPE appointment_estado ADD VALUE IF NOT EXISTS 'expirada';
