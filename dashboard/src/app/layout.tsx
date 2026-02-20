import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "claudedash",
  description: "Execution observer for AI agent workflows",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
