-- Dois gaps da mesma família dos anteriores: nenhuma policy de escrita
-- cobria os efeitos colaterais legítimos de PROFISSIONAL/CLIENTE mudando o
-- status do próprio agendamento (ver stateMachine.ts):
--
-- 1) AppointmentStatusLog só tinha SELECT pra PROFESSIONAL/CLIENT (nenhuma
--    policy de INSERT) — ou seja, nem admin nem ninguém mais conseguia logar
--    uma transição de status feita por profissional ou cliente (ex.:
--    cliente cancelando o próprio agendamento, profissional confirmando/
--    concluindo um atendimento).
-- 2) "Client" só tinha SELECT pra PROFESSIONAL (via professional_via_appointment)
--    — quando o profissional marca um atendimento como NO_SHOW, o código
--    incrementa Client.noShowCount (e eventualmente bloqueia o cliente),
--    o que exige UPDATE, não só SELECT.

CREATE POLICY professional_insert_own ON "AppointmentStatusLog" FOR INSERT
  WITH CHECK (
    current_app_role() = 'PROFESSIONAL' AND EXISTS (
      SELECT 1 FROM "Appointment" a
      WHERE a.id = "AppointmentStatusLog"."appointmentId" AND a."professionalId" = current_app_user_id()
    )
  );

CREATE POLICY client_insert_own ON "AppointmentStatusLog" FOR INSERT
  WITH CHECK (
    current_app_role() = 'CLIENT' AND EXISTS (
      SELECT 1 FROM "Appointment" a
      WHERE a.id = "AppointmentStatusLog"."appointmentId" AND a."clientId" = current_app_user_id()
    )
  );

-- Trocado por SELECT + UPDATE explícitos (não FOR ALL) — profissional pode
-- ler/atualizar (ex.: noShowCount) um cliente que já atendeu, mas nunca
-- apagar o cadastro dele; isso continua exclusivo de ADMIN.
DROP POLICY professional_via_appointment ON "Client";
CREATE POLICY professional_via_appointment ON "Client" FOR SELECT
  USING (
    current_app_role() = 'PROFESSIONAL' AND EXISTS (
      SELECT 1 FROM "Appointment" a
      WHERE a."clientId" = "Client".id AND a."professionalId" = current_app_user_id()
    )
  );
CREATE POLICY professional_update_via_appointment ON "Client" FOR UPDATE
  USING (
    current_app_role() = 'PROFESSIONAL' AND EXISTS (
      SELECT 1 FROM "Appointment" a
      WHERE a."clientId" = "Client".id AND a."professionalId" = current_app_user_id()
    )
  );
