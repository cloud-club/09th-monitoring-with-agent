const { PrismaClient } = require("@prisma/client");

const isPrismaEnabled = Boolean(process.env.DATABASE_URL);

const prisma = isPrismaEnabled
  ? new PrismaClient()
  : {
      $queryRaw: async () => {
        throw new Error("DATABASE_URL is not configured");
      },
    };

module.exports = {
  prisma,
  isPrismaEnabled,
};
