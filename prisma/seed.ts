import "dotenv/config";
import { prisma } from "../src/server/db/client";
import { withAppContext } from "../src/server/db/context";
import { syncUsersToSupabaseAuth, isSupabaseConfigured } from "../scripts/lib/syncUsersToSupabaseAuth";

const DEMO_PASSWORD = "senha123";

async function main() {
  await withAppContext({ role: "ADMIN", userId: null }, async (tx) => {
    const unit = await tx.unit.upsert({
      where: { id: "00000000-0000-0000-0000-000000000001" },
      update: {},
      create: {
        id: "00000000-0000-0000-0000-000000000001",
        name: "Bacelar 1",
        address: "Travessa Boa Viagem, 03",
        phone: "(81) 90000-0000",
        active: true,
      },
    });

    const adminUser = await tx.user.upsert({
      where: { email: "admin@bacelar.dev" },
      update: { name: "Jeferson Soares" },
      create: {
        email: "admin@bacelar.dev",
        name: "Jeferson Soares",
        phone: "(81) 90000-0001",
        role: "ADMIN",
      },
    });

    const professionalUser = await tx.user.upsert({
      where: { email: "profissional@bacelar.dev" },
      update: {},
      create: {
        email: "profissional@bacelar.dev",
        phone: "(81) 90000-0002",
        role: "PROFESSIONAL",
      },
    });

    const professional = await tx.professional.upsert({
      where: { userId: professionalUser.id },
      update: {},
      create: {
        userId: professionalUser.id,
        name: "Enrique Bacelar",
        color: "#F5B301",
        title: "Barbeiro",
      },
    });

    await tx.professionalUnit.upsert({
      where: {
        professionalId_unitId: { professionalId: professional.id, unitId: unit.id },
      },
      update: {},
      create: { professionalId: professional.id, unitId: unit.id },
    });

    for (let weekday = 1; weekday <= 6; weekday++) {
      await tx.weeklyAvailability.upsert({
        where: {
          professionalId_weekday_startTime: {
            professionalId: professional.id,
            weekday,
            startTime: "09:00",
          },
        },
        update: {},
        create: {
          professionalId: professional.id,
          weekday,
          startTime: "09:00",
          endTime: "19:00",
        },
      });
    }

    const clientUser = await tx.user.upsert({
      where: { email: "cliente@bacelar.dev" },
      update: {},
      create: {
        email: "cliente@bacelar.dev",
        phone: "(81) 90000-0003",
        role: "CLIENT",
      },
    });

    await tx.client.upsert({
      where: { userId: clientUser.id },
      update: {},
      create: {
        userId: clientUser.id,
        name: "Cliente Demo",
        phone: "(81) 90000-0003",
        email: "cliente@bacelar.dev",
      },
    });

    const section = await tx.serviceSection.upsert({
      where: { id: "00000000-0000-0000-0000-000000000010" },
      update: {},
      create: {
        id: "00000000-0000-0000-0000-000000000010",
        unitId: unit.id,
        name: "Cortes e combos masculino",
        order: 0,
      },
    });

    await tx.service.upsert({
      where: { id: "00000000-0000-0000-0000-000000000020" },
      update: {},
      create: {
        id: "00000000-0000-0000-0000-000000000020",
        sectionId: section.id,
        name: "Corte",
        durationMinutes: 30,
        price: 45,
        genderTag: "M",
        featured: true,
      },
    });

    await tx.systemSettings.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1 },
    });

    void adminUser;
  });

  // Linka os Users acima a contas Supabase Auth com a MESMA senha de
  // demonstração — só roda se NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY
  // estiverem no .env (Fase 10+). Sem Supabase configurado (dev local
  // pré-Fase-10), este passo é pulado e o seed continua útil só pros dados
  // de negócio — mas login não funciona até existir um projeto Supabase,
  // já que a autenticação não usa mais senha própria do app.
  if (isSupabaseConfigured()) {
    await syncUsersToSupabaseAuth({ password: DEMO_PASSWORD });
    console.log("Contas Supabase Auth sincronizadas (senha para todos: %s):", DEMO_PASSWORD);
  } else {
    console.log(
      "Seed de dados concluído. NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes — nenhuma conta de login foi criada (ver Fase 10 no guia de deploy).",
    );
  }
  console.log("  ADMIN        -> admin@bacelar.dev");
  console.log("  PROFESSIONAL -> profissional@bacelar.dev");
  console.log("  CLIENT       -> cliente@bacelar.dev");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
