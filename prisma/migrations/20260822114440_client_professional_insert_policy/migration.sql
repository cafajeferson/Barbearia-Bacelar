-- Mesmo gap da família anterior: NewAppointmentDialog é reaproveitado em
-- Minha Agenda (profissional) para cadastrar cliente novo inline ao criar
-- um walk-in — createClient() no app layer já permite ADMIN e PROFESSIONAL
-- (requireStaff), mas "Client" só tinha policy de escrita pra ADMIN
-- (admin_all FOR ALL). Profissional registrando um walk-in com cliente novo
-- caía em "42501 new row violates row-level security policy".

CREATE POLICY professional_insert_walkin ON "Client" FOR INSERT
  WITH CHECK (current_app_role() = 'PROFESSIONAL');
