-- Não era um "quirk" do query-interpreter do Prisma 7 como pareceu à primeira
-- vista: confirmado com um INSERT bruto via psql (sem RETURNING) funcionando
-- normalmente. A causa real é comportamento padrão do Postgres — quando a
-- tabela tem RLS habilitado, o RETURNING de um INSERT (que tanto
-- tx.client.create() quanto um $queryRaw com RETURNING disparam) é filtrado
-- pelas policies de SELECT da tabela, não só pelo WITH CHECK do INSERT. Um
-- profissional cadastrando um cliente walk-in cai em "42501 new row violates
-- row-level security policy" porque professional_via_appointment (SELECT)
-- exige um Appointment já existente ligando profissional e cliente — que
-- ainda não existe no momento da criação do cliente.
--
-- Clientes walk-in não pertencem à agenda de um profissional específico
-- (podem ser atendidos por qualquer um), então a policy certa é liberar
-- SELECT de walk-ins pra qualquer PROFESSIONAL, não só via Appointment.

CREATE POLICY professional_select_walkin ON "Client" FOR SELECT
  USING (current_app_role() = 'PROFESSIONAL' AND "isWalkIn" = true);
