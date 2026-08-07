import crypto from "node:crypto";

export const runtime = "nodejs";

type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicUrl?: string;
};

function getR2Config(): R2Config | null {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL } = process.env;

  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
    return null;
  }

  return {
    accountId: R2_ACCOUNT_ID,
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    bucket: R2_BUCKET,
    publicUrl: R2_PUBLIC_URL,
  };
}

function hmac(key: crypto.BinaryLike | crypto.KeyObject, value: string) {
  return crypto.createHmac("sha256", key).update(value, "utf8").digest();
}

function hash(value: crypto.BinaryLike) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function amzDate(date = new Date()) {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return {
    full: iso,
    short: iso.slice(0, 8),
  };
}

function encodeKey(key: string) {
  return key
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function signingKey(secretAccessKey: string, date: string) {
  const dateKey = hmac(`AWS4${secretAccessKey}`, date);
  const regionKey = hmac(dateKey, "auto");
  const serviceKey = hmac(regionKey, "s3");
  return hmac(serviceKey, "aws4_request");
}

function signPutObject({
  accessKeyId,
  bodyHash,
  bucket,
  contentType,
  host,
  key,
  secretAccessKey,
}: R2Config & {
  bodyHash: string;
  contentType: string;
  host: string;
  key: string;
}) {
  const date = amzDate();
  const canonicalUri = `/${bucket}/${encodeKey(key)}`;
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
  const canonicalHeaders = [
    `content-type:${contentType}`,
    `host:${host}`,
    `x-amz-content-sha256:${bodyHash}`,
    `x-amz-date:${date.full}`,
    "",
  ].join("\n");
  const canonicalRequest = ["PUT", canonicalUri, "", canonicalHeaders, signedHeaders, bodyHash].join("\n");
  const credentialScope = `${date.short}/auto/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", date.full, credentialScope, hash(canonicalRequest)].join("\n");
  const signature = crypto.createHmac("sha256", signingKey(secretAccessKey, date.short)).update(stringToSign).digest("hex");

  return {
    authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    date: date.full,
  };
}

export async function POST(request: Request) {
  try {
    const config = getR2Config();

    if (!config) {
      return Response.json(
        {
          error:
            "R2 is not configured. Add R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, and optionally R2_PUBLIC_URL.",
        },
        { status: 501 },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return Response.json({ error: "Upload requires an image file." }, { status: 400 });
    }

    if (!file.type.startsWith("image/")) {
      return Response.json({ error: "Only image uploads are allowed." }, { status: 400 });
    }

    if (file.type !== "image/jpeg") {
      return Response.json({ error: "Uploads must be converted to JPEG before storage." }, { status: 400 });
    }

    const cardName = String(formData.get("cardName") ?? "proxy");
    const body = Buffer.from(await file.arrayBuffer());
    const bodyHash = hash(body);
    const key = `proxies/${slugify(cardName) || "card"}/${crypto.randomUUID()}.jpg`;
    const host = `${config.accountId}.r2.cloudflarestorage.com`;
    const contentType = "image/jpeg";
    const signature = signPutObject({
      ...config,
      bodyHash,
      contentType,
      host,
      key,
    });

    const uploadUrl = `https://${host}/${config.bucket}/${encodeKey(key)}`;
    const response = await fetch(uploadUrl, {
      method: "PUT",
      body,
      headers: {
        Authorization: signature.authorization,
        "Content-Type": contentType,
        "X-Amz-Content-Sha256": bodyHash,
        "X-Amz-Date": signature.date,
      },
    });

    if (!response.ok) {
      const message = await response.text();
      return Response.json({ error: `R2 upload failed: ${message || response.statusText}` }, { status: 502 });
    }

    const publicBase = config.publicUrl?.replace(/\/+$/, "") ?? `https://${host}/${config.bucket}`;

    return Response.json({
      key,
      imageUrl: `${publicBase}/${encodeKey(key)}`,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unexpected upload failure." },
      { status: 500 },
    );
  }
}
