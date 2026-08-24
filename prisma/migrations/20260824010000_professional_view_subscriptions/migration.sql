-- Profissional não tinha NENHUMA policy em ClientSubscription (só admin_all
-- e client_own) — a query da própria agenda que inclui client.subscriptions
-- pra decidir o selo de coroa voltava sempre vazia pra esse papel, mesmo
-- pro cliente sendo dono de assinatura ativa de verdade. Mesmo padrão já
-- usado em "Client" (professional_own): só enxerga a assinatura de um
-- cliente com quem já tem/teve agendamento.
CREATE POLICY professional_via_appointment ON "ClientSubscription" FOR SELECT
  USING (
    current_app_role() = 'PROFESSIONAL' AND EXISTS (
      SELECT 1 FROM "Appointment" a
      WHERE a."clientId" = "ClientSubscription"."clientId" AND a."professionalId" = current_app_user_id()
    )
  );
