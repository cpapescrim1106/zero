import { PrismaClient } from "@zero/db";

export function createDb(databaseUrl: string) {
  return new PrismaClient({
    datasources: { db: { url: databaseUrl } }
  });
}
