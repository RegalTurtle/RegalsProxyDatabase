import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Regal's Proxy Database",
  description: "A personal Magic proxy archive powered by Scryfall and Cloudflare R2.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
