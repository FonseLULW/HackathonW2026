import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SnoopLog Dashboard",
  description: "Real-time anomaly and incident dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
