-- ============================================================
-- MedCitas — Migration 023: tipo de notificación para el chat
-- Run in: Supabase Dashboard → SQL Editor → New query
--
-- Ejecuta este archivo solo, y después 024_mensajes.sql en otra consulta:
-- Postgres no permite usar un valor nuevo de un enum en la misma transacción
-- en que se crea.
--
--   mensaje_nuevo · llegó un mensaje del administrador o de la IPS
-- ============================================================

ALTER TYPE notification_tipo ADD VALUE IF NOT EXISTS 'mensaje_nuevo';
