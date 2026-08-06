import { MongoClient } from "mongodb";

let clientPromise: Promise<MongoClient> | null = null;

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

  return client.db(dbName).collection(collectionName);
}
