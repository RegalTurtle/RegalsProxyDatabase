import { MongoClient } from "mongodb";

let clientPromise: Promise<MongoClient> | null = null;
let proxyIndexesPromise: Promise<string[]> | null = null;

async function getClient() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("MONGODB_URI is not configured.");
  }

  if (!clientPromise) {
    clientPromise = new MongoClient(uri).connect();
  }

  return clientPromise;
}

export async function getProxyCollection() {
  const client = await getClient();
  const dbName = process.env.MONGODB_DB || "regals-proxy-database";
  const collectionName = process.env.MONGODB_PROXIES_COLLECTION || "proxies";

  const collection = client.db(dbName).collection(collectionName);

  proxyIndexesPromise ??= collection.createIndexes([
    { key: { baseCardId: 1, createdAt: -1 }, name: "baseCardId_createdAt" },
    { key: { createdAt: -1 }, name: "createdAt" },
    { key: { id: 1 }, name: "id_unique", unique: true },
  ]);

  await proxyIndexesPromise;

  return collection;
}
