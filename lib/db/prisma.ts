import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | null | undefined;
  prismaUnavailableLogged: boolean | undefined;
};

function hasLocalPrismaEngine() {
  const clientDir = path.join(process.cwd(), "node_modules", ".prisma", "client");
  if (!fs.existsSync(clientDir)) {
    return false;
  }

  const files = fs.readdirSync(clientDir);
  return files.some((file) => {
    if (file.startsWith(".") || file.endsWith(".icloud")) {
      return false;
    }

    return /^libquery_engine-.*\.node$/i.test(file) || /^query-engine-/.test(file);
  });
}

function createPrismaClient() {
  if (!hasLocalPrismaEngine()) {
    if (!globalForPrisma.prismaUnavailableLogged) {
      console.warn("[Prisma] Query engine not found locally. Running with DB persistence disabled.");
      globalForPrisma.prismaUnavailableLogged = true;
    }
    return null;
  }

  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();
export const isPrismaAvailable = Boolean(prisma);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
