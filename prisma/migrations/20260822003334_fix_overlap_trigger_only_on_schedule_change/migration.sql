-- Bug: o trigger original revalidava overlap em QUALQUER UPDATE do Appointment,
-- inclusive quando só o status mudava (ex.: SCHEDULED -> COMPLETED). Isso
-- travava updates legítimos numa linha que só compartilhava horário com um
-- walk-in forçado (forceOverlap=true) — a linha original nunca precisou de
-- force, mas passava a ser bloqueada por qualquer edição futura, mesmo sem
-- mexer em horário/profissional. Corrigido: só reavalia overlap quando
-- scheduledDate/startTime/endTime/professionalId realmente mudam.

CREATE OR REPLACE FUNCTION check_booking_overlap() RETURNS trigger AS $$
BEGIN
  IF NEW."forceOverlap" IS TRUE THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW."scheduledDate" = OLD."scheduledDate"
     AND NEW."startTime" = OLD."startTime"
     AND NEW."endTime" = OLD."endTime"
     AND NEW."professionalId" = OLD."professionalId" THEN
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
