const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function seedChannels() {
  await prisma.channel.upsert({
    where: { code: "MAIN" },
    update: { name: "Main Channel" },
    create: { code: "MAIN", name: "Main Channel" },
  });

  await prisma.channel.upsert({
    where: { code: "B2B" },
    update: { name: "B2B Channel" },
    create: { code: "B2B", name: "B2B Channel" },
  });
}

async function seedSections() {
  await prisma.section.upsert({
    where: { code: "HOME" },
    update: { name: "Home" },
    create: { code: "HOME", name: "Home" },
  });

  await prisma.section.upsert({
    where: { code: "TREND" },
    update: { name: "Trend" },
    create: { code: "TREND", name: "Trend" },
  });
}

async function seedCoins() {
  await prisma.deposit.upsert({
    where: { code: "PURCHASE" },
    update: { source: "order", direction: 1 },
    create: { code: "PURCHASE", source: "order", direction: 1 },
  });

  await prisma.mileage.upsert({
    where: { code: "REWARD" },
    update: { source: "event", direction: 1 },
    create: { code: "REWARD", source: "event", direction: 1 },
  });
}

async function main() {
  await seedChannels();
  await seedSections();
  await seedCoins();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error("Seed failed:", error);
    await prisma.$disconnect();
    process.exit(1);
  });
