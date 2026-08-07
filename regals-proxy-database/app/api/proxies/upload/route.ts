import crypto from "node:crypto";
import { getR2Config, putR2Object, slugify } from "@/lib/r2";

export const runtime = "nodejs";

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
    const key = `proxies/${slugify(cardName) || "card"}/${crypto.randomUUID()}.jpg`;
    const upload = await putR2Object({ body, contentType: "image/jpeg", key });

    return Response.json({
      key,
      imageUrl: upload.url,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unexpected upload failure." },
      { status: 500 },
    );
  }
}
