-- Bug: as policies de RecurringSeries só cobriam SELECT para PROFESSIONAL e
-- CLIENT (client_own/professional_own), sem nenhuma policy de INSERT — um
-- cliente nunca conseguia criar a própria série ao ativar "Agendamento
-- recorrente" no wizard (Fase 5), porque não existe policy = acesso negado
-- por padrão em tabela com RLS habilitada. Adiciona INSERT para o próprio
-- cliente, mantendo tudo o mais (update/delete da série) restrito a admin.

CREATE POLICY client_insert_own ON "RecurringSeries" FOR INSERT
  WITH CHECK (current_app_role() = 'CLIENT' AND "clientId" = current_app_user_id());
