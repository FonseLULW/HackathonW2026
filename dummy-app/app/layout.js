import "./globals.css";

export const metadata = {
  title: "SnoopCart Demo",
  description: "Dummy storefront that emits realistic operational logs for SnoopLog.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-stone-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
