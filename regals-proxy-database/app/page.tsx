import { cookies } from "next/headers";
import ProxyArchive from "./proxy-archive";

export default async function Home() {
  const imageSource = (await cookies()).get("proxy-image-source")?.value;
  return <ProxyArchive initialImageSource={imageSource === "proxy" ? "proxy" : "original"} />;
}
