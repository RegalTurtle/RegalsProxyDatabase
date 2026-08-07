import ProxyArchive from "./proxy-archive";

export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;

  return <ProxyArchive initialQuery={q ?? ""} />;
}
