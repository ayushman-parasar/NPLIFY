import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: "NPLify ERD",
  description: "NPLify P0 data model: interactive map and assistant for NPL staff.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0b1020" },
    { media: "(prefers-color-scheme: dark)", color: "#070a12" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The theme choice travels in a cookie so the server can set it before first paint (no flash, no inline script).
  const saved = (await cookies()).get("erd-theme")?.value;
  const theme = saved === "dark" || saved === "light" ? saved : undefined;
  return (
    <html lang="en" data-theme={theme} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;450;500;600;650;700&family=JetBrains+Mono:wght@400;500;600;650&display=swap"
        />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
