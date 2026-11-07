-- Fechamento automático dos atendimentos que ninguém concluiu nem marcou
-- como falta (igual ao "Fechamento dos Atendimentos" do sistema original):
-- depois de N dias o atendimento é concluído sozinho e recebe o selo
-- "Fechado pelo sistema". Só colunas novas, com default — nada existente muda.
ALTER TABLE "Appointment" ADD COLUMN "closedBySystem" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "SystemSettings"
  ADD COLUMN "autoCloseEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "autoCloseAfterDays" INTEGER NOT NULL DEFAULT 3;
