-- Allow users to delete their own notifications (for the "Limpiar" button)
CREATE POLICY "notifications_delete_own" ON notifications
  FOR DELETE USING (user_id = auth.uid());
