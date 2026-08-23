-- Produtos que o cliente pede pra separar junto com o agendamento — não é
-- uma venda de verdade (ProductSale continua sendo isso, com comissão
-- etc.), é só "separa isso pra mim" que o profissional vê nos detalhes do
-- atendimento. Sem RLS própria, mesmo padrão já usado em AppointmentService
-- (tabela de detalhe, sempre acessada via o Appointment pai, que já é
-- corretamente filtrado pelas policies dele).
CREATE TABLE "AppointmentProduct" (
    "appointmentId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "priceAtBooking" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "AppointmentProduct_pkey" PRIMARY KEY ("appointmentId","productId")
);

ALTER TABLE "AppointmentProduct" ADD CONSTRAINT "AppointmentProduct_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppointmentProduct" ADD CONSTRAINT "AppointmentProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
