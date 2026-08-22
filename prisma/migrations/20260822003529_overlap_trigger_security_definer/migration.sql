-- Bug de segurança: check_booking_overlap() rodava com SECURITY INVOKER
-- (o padrão), ou seja, as duas consultas EXISTS dentro do trigger ficavam
-- sujeitas à RLS da sessão que disparou o INSERT/UPDATE. Resultado:
--   - Uma sessão CLIENT só enxerga os PRÓPRIOS agendamentos (policy
--     client_own em "Appointment"), então o EXISTS de conflito com outros
--     clientes do MESMO profissional/horário retornava falso negativo —
--     um cliente conseguiria reservar em cima do agendamento de outro.
--   - "BlockedSlot" não tem nenhuma policy para CLIENT, então o EXISTS
--     de bloqueio (folga/almoço) simplesmente nunca via nada para uma
--     sessão CLIENT — o bloqueio era ignorado por completo.
-- Prevenção de double-booking é um invariante do sistema, não deve
-- depender de quem está perguntando. Corrigido com SECURITY DEFINER
-- (a função roda com o privilégio de quem a criou — o superusuário
-- "postgres" — que ignora RLS), com search_path fixado por segurança.

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;
