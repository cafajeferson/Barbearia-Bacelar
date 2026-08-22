-- =====================================================================
-- Papel de aplicação (não-superusuário) para que RLS realmente se aplique.
-- O papel "postgres" (superusuário, dono das tabelas) sempre ignora RLS,
-- então o runtime da aplicação conecta como "app_user" (ver APP_DATABASE_URL),
-- enquanto "prisma migrate" continua usando "postgres" via DATABASE_URL.
-- O CREATE ROLE em si roda fora desta migration (contém senha) — ver README.
-- =====================================================================

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO app_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL PRIVILEGES ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL PRIVILEGES ON SEQUENCES TO app_user;

-- =====================================================================
-- Funções indiretas para as claims de autorização.
-- Em dev, leem a session variable setada pelo Prisma via `SET LOCAL` a
-- partir da sessão NextAuth já verificada no servidor (nunca do cliente).
-- Na Fase 10 (Supabase), são redefinidas para ler auth.jwt() — as policies
-- abaixo não mudam.
-- =====================================================================

CREATE OR REPLACE FUNCTION current_app_role() RETURNS text AS $$
  SELECT current_setting('app.role', true)
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION current_app_user_id() RETURNS text AS $$
  SELECT current_setting('app.user_id', true)
$$ LANGUAGE sql STABLE;

-- =====================================================================
-- RLS: habilitada nas tabelas cujo acesso depende de "quem está logado"
-- (agendamentos, dados de cliente, financeiro, notificações, disponibilidade).
-- Catálogo/planos/promoções/cupons ficam de leitura aberta por natureza
-- (vitrine pública) — a escrita neles é protegida na camada de API, não por RLS.
-- Nota: RLS é por LINHA, não por COLUNA — o campo "passwordHash" em User e os
-- campos de comissão em Professional continuam exigindo que a aplicação nunca
-- os inclua em `select` nas rotas acessíveis por CLIENT/PROFESSIONAL.
-- =====================================================================

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_all ON "User" FOR ALL
  USING (current_app_role() = 'ADMIN');
CREATE POLICY self_select ON "User" FOR SELECT
  USING (id = current_app_user_id());

ALTER TABLE "Professional" ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_all ON "Professional" FOR ALL
  USING (current_app_role() = 'ADMIN');
CREATE POLICY self_all ON "Professional" FOR ALL
  USING (current_app_role() = 'PROFESSIONAL' AND id = current_app_user_id());
CREATE POLICY client_read ON "Professional" FOR SELECT
  USING (current_app_role() = 'CLIENT' AND active = true);

ALTER TABLE "WeeklyAvailability" ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_all ON "WeeklyAvailability" FOR ALL
  USING (current_app_role() = 'ADMIN');
CREATE POLICY professional_own ON "WeeklyAvailability" FOR ALL
  USING (current_app_role() = 'PROFESSIONAL' AND "professionalId" = current_app_user_id());

ALTER TABLE "BlockedSlot" ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_all ON "BlockedSlot" FOR ALL
  USING (current_app_role() = 'ADMIN');
CREATE POLICY professional_own ON "BlockedSlot" FOR ALL
  USING (current_app_role() = 'PROFESSIONAL' AND "professionalId" = current_app_user_id());

ALTER TABLE "Client" ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_all ON "Client" FOR ALL
  USING (current_app_role() = 'ADMIN');
CREATE POLICY self_all ON "Client" FOR ALL
  USING (current_app_role() = 'CLIENT' AND id = current_app_user_id());
CREATE POLICY professional_via_appointment ON "Client" FOR SELECT
  USING (
    current_app_role() = 'PROFESSIONAL' AND EXISTS (
      SELECT 1 FROM "Appointment" a
      WHERE a."clientId" = "Client".id AND a."professionalId" = current_app_user_id()
    )
  );

ALTER TABLE "Appointment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_all ON "Appointment" FOR ALL
  USING (current_app_role() = 'ADMIN');
CREATE POLICY professional_own ON "Appointment" FOR ALL
  USING (current_app_role() = 'PROFESSIONAL' AND "professionalId" = current_app_user_id())
  WITH CHECK (current_app_role() = 'PROFESSIONAL' AND "professionalId" = current_app_user_id());
CREATE POLICY client_own ON "Appointment" FOR ALL
  USING (current_app_role() = 'CLIENT' AND "clientId" = current_app_user_id())
  WITH CHECK (current_app_role() = 'CLIENT' AND "clientId" = current_app_user_id());

ALTER TABLE "AppointmentStatusLog" ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_all ON "AppointmentStatusLog" FOR ALL
  USING (current_app_role() = 'ADMIN');
CREATE POLICY professional_via_appointment ON "AppointmentStatusLog" FOR SELECT
  USING (
    current_app_role() = 'PROFESSIONAL' AND EXISTS (
      SELECT 1 FROM "Appointment" a
      WHERE a.id = "AppointmentStatusLog"."appointmentId" AND a."professionalId" = current_app_user_id()
    )
  );

ALTER TABLE "RecurringSeries" ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_all ON "RecurringSeries" FOR ALL
  USING (current_app_role() = 'ADMIN');
CREATE POLICY professional_own ON "RecurringSeries" FOR SELECT
  USING (current_app_role() = 'PROFESSIONAL' AND "professionalId" = current_app_user_id());
CREATE POLICY client_own ON "RecurringSeries" FOR SELECT
  USING (current_app_role() = 'CLIENT' AND "clientId" = current_app_user_id());

ALTER TABLE "ClientSubscription" ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_all ON "ClientSubscription" FOR ALL
  USING (current_app_role() = 'ADMIN');
CREATE POLICY client_own ON "ClientSubscription" FOR ALL
  USING (current_app_role() = 'CLIENT' AND "clientId" = current_app_user_id())
  WITH CHECK (current_app_role() = 'CLIENT' AND "clientId" = current_app_user_id());

ALTER TABLE "CommissionEntry" ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_all ON "CommissionEntry" FOR ALL
  USING (current_app_role() = 'ADMIN');
CREATE POLICY professional_own ON "CommissionEntry" FOR SELECT
  USING (current_app_role() = 'PROFESSIONAL' AND "professionalId" = current_app_user_id());

ALTER TABLE "NotificationLog" ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_all ON "NotificationLog" FOR ALL
  USING (current_app_role() = 'ADMIN');
CREATE POLICY client_own ON "NotificationLog" FOR ALL
  USING (current_app_role() = 'CLIENT' AND "clientId" = current_app_user_id());
CREATE POLICY user_own ON "NotificationLog" FOR ALL
  USING ("userId" = current_app_user_id());

-- =====================================================================
-- Trigger de conflito de horário: bloqueia overlap por padrão, mas nunca
-- de forma irrevogável — quando "forceOverlap" = true (só ADMIN grava isso,
-- ver server/services/appointments/transitionStatus.ts), o trigger deixa
-- passar e o ActivityLog registra o override. Considera tanto outros
-- agendamentos quanto bloqueios de horário (folga/almoço) do profissional.
-- =====================================================================

CREATE OR REPLACE FUNCTION check_booking_overlap() RETURNS trigger AS $$
BEGIN
  IF NEW."forceOverlap" IS TRUE THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM "Appointment" a
    WHERE a.id <> NEW.id
      AND a."professionalId" = NEW."professionalId"
      AND a."scheduledDate" = NEW."scheduledDate"
      AND a.status IN ('SCHEDULED', 'CONFIRMED', 'IN_PROGRESS')
      AND a."startTime"::time < NEW."endTime"::time
      AND a."endTime"::time > NEW."startTime"::time
  ) THEN
    RAISE EXCEPTION 'Conflito de horário: já existe um agendamento para este profissional neste intervalo. Use forceOverlap para sobrepor manualmente.'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "BlockedSlot" b
    WHERE b."professionalId" = NEW."professionalId"
      AND b.date = NEW."scheduledDate"
      AND b."startTime"::time < NEW."endTime"::time
      AND b."endTime"::time > NEW."startTime"::time
  ) THEN
    RAISE EXCEPTION 'Conflito de horário: este horário está bloqueado (folga/almoço) para este profissional. Use forceOverlap para sobrepor manualmente.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_booking_overlap
  BEFORE INSERT OR UPDATE ON "Appointment"
  FOR EACH ROW EXECUTE FUNCTION check_booking_overlap();
