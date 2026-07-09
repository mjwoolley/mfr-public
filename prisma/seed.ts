import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const alice = await prisma.shareholder.upsert({
    where: { email: "alice@example.com" },
    update: {},
    create: { name: "Alice Miller", email: "alice@example.com" },
  });
  const bob = await prisma.shareholder.upsert({
    where: { email: "bob@example.com" },
    update: {},
    create: { name: "Bob Miller", email: "bob@example.com" },
  });

  console.log("Seeded shareholders:", alice.name, bob.name);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
