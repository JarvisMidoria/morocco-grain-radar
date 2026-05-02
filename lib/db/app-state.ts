import type { Prisma } from "@prisma/client";
import { isPrismaAvailable, prisma } from "@/lib/db/prisma";

export type PersistenceBackend = "prisma" | "file";

const warnedNamespaces = new Set<string>();

function isPrismaAppStateDisabled() {
  return process.env.RADAR_DISABLE_PRISMA_APP_STATE === "true";
}

function warnOnce(namespace: string, message: string) {
  const key = `${namespace}:${message}`;
  if (warnedNamespaces.has(key)) {
    return;
  }

  warnedNamespaces.add(key);
  console.warn(message);
}

export function isDbUnavailableError(error: unknown) {
  if (error && typeof error === "object") {
    const typed = error as { name?: string; code?: string };
    if (typed.name === "PrismaClientInitializationError") {
      return true;
    }
    if (typed.name === "PrismaClientKnownRequestError") {
      return ["P1001", "P1002", "P1017", "P2021", "P2022"].includes(typed.code ?? "");
    }
  }

  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (!message) {
    return false;
  }

  return (
    message.includes("can't reach database server") ||
    message.includes("failed to connect") ||
    message.includes("connection refused") ||
    message.includes("econnrefused") ||
    message.includes("server closed the connection") ||
    message.includes("timed out fetching a new connection") ||
    message.includes("does not exist in the current database")
  );
}

export async function readAppState<T>(input: {
  namespace: string;
  normalize: (raw: unknown) => T;
}): Promise<{ backend: PersistenceBackend; store: T | null }> {
  if (isPrismaAppStateDisabled() || !isPrismaAvailable || !prisma) {
    return { backend: "file", store: null };
  }

  try {
    const record = await prisma.radarAppState.findUnique({
      where: { key: input.namespace },
    });
    if (!record) {
      return { backend: "prisma", store: null };
    }

    return {
      backend: "prisma",
      store: input.normalize(record.payload),
    };
  } catch (error) {
    if (isDbUnavailableError(error)) {
      warnOnce(
        input.namespace,
        `[RadarState] Prisma app-state read failed for ${input.namespace}. Falling back to file store.`,
      );
      return { backend: "file", store: null };
    }

    throw error;
  }
}

export async function writeAppState<T>(input: {
  namespace: string;
  payload: T;
}): Promise<PersistenceBackend> {
  if (isPrismaAppStateDisabled() || !isPrismaAvailable || !prisma) {
    return "file";
  }

  try {
    await prisma.radarAppState.upsert({
      where: { key: input.namespace },
      update: {
        payload: input.payload as Prisma.InputJsonValue,
      },
      create: {
        key: input.namespace,
        payload: input.payload as Prisma.InputJsonValue,
      },
    });
    return "prisma";
  } catch (error) {
    if (isDbUnavailableError(error)) {
      warnOnce(
        input.namespace,
        `[RadarState] Prisma app-state write failed for ${input.namespace}. Falling back to file store.`,
      );
      return "file";
    }

    throw error;
  }
}
