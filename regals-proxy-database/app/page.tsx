import { cookies } from "next/headers";
import ProxyArchive from "./proxy-archive";

export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const imageSource = (await cookies()).get("proxy-image-source")?.value;
  return <ProxyArchive initialQuery={q ?? ""} initialImageSource={imageSource === "proxy" ? "proxy" : "original"} />;
}
