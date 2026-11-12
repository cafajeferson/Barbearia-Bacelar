-- Regra de visibilidade (pedido do dono, 2026-11-11):
--   * ADMIN vê tudo.
--   * PROFISSIONAL vê TODOS os clientes (para buscar e agendar qualquer um),
--     mas de serviços, produtos, comissões etc. só o que ELE realizou.
--   * CLIENTE vê só o que é dele.

-- 1) Profissional enxerga o cadastro de qualquer cliente (só leitura).
--    Alterar continua restrito a quem já atendeu (professional_update_via_appointment).
CREATE POLICY professional_select_all ON "Client" FOR SELECT
  USING (current_app_role() = 'PROFESSIONAL');

-- 2) Tabelas que eram abertas a qualquer papel passam a seguir o
--    agendamento: a linha só é visível/gravável se o Appointment dela for
--    visível para quem pergunta. Como "Appointment" já tem RLS (admin tudo,
--    profissional só os dele, cliente só os dele), o EXISTS herda essa regra.
ALTER TABLE "AppointmentService" ENABLE ROW LEVEL SECURITY;
CREATE POLICY via_appointment ON "AppointmentService" FOR ALL
  USING (EXISTS (SELECT 1 FROM "Appointment" a WHERE a.id = "AppointmentService"."appointmentId"))
  WITH CHECK (EXISTS (SELECT 1 FROM "Appointment" a WHERE a.id = "AppointmentService"."appointmentId"));

ALTER TABLE "AppointmentProduct" ENABLE ROW LEVEL SECURITY;
CREATE POLICY via_appointment ON "AppointmentProduct" FOR ALL
  USING (EXISTS (SELECT 1 FROM "Appointment" a WHERE a.id = "AppointmentProduct"."appointmentId"))
  WITH CHECK (EXISTS (SELECT 1 FROM "Appointment" a WHERE a.id = "AppointmentProduct"."appointmentId"));

ALTER TABLE "SubscriptionCreditUsage" ENABLE ROW LEVEL SECURITY;
CREATE POLICY via_appointment ON "SubscriptionCreditUsage" FOR ALL
  USING (EXISTS (SELECT 1 FROM "Appointment" a WHERE a.id = "SubscriptionCreditUsage"."appointmentId"))
  WITH CHECK (EXISTS (SELECT 1 FROM "Appointment" a WHERE a.id = "SubscriptionCreditUsage"."appointmentId"));

ALTER TABLE "CouponRedemption" ENABLE ROW LEVEL SECURITY;
CREATE POLICY via_appointment ON "CouponRedemption" FOR ALL
  USING (EXISTS (SELECT 1 FROM "Appointment" a WHERE a.id = "CouponRedemption"."appointmentId"))
  WITH CHECK (EXISTS (SELECT 1 FROM "Appointment" a WHERE a.id = "CouponRedemption"."appointmentId"));

-- 3) Venda de balcão: admin tudo; profissional só as que ele fez;
--    cliente só as compras dele.
ALTER TABLE "ProductSale" ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_all ON "ProductSale" FOR ALL
  USING (current_app_role() = 'ADMIN') WITH CHECK (current_app_role() = 'ADMIN');
CREATE POLICY professional_own ON "ProductSale" FOR ALL
  USING (current_app_role() = 'PROFESSIONAL' AND "professionalId" = current_app_user_id())
  WITH CHECK (current_app_role() = 'PROFESSIONAL' AND "professionalId" = current_app_user_id());
CREATE POLICY client_own ON "ProductSale" FOR SELECT
  USING (current_app_role() = 'CLIENT' AND "clientId" = current_app_user_id());
