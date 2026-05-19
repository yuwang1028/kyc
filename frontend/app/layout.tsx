import type { ReactNode } from "react";
import Link from "next/link";

export const metadata = {
  title: "Agentic KYC Platform",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif",
          background: "#0b1020",
          color: "#e5e7eb",
        }}
      >
        <header
          style={{
            padding: "14px 24px",
            background: "#11162b",
            borderBottom: "1px solid #1f2547",
            display: "flex",
            gap: 20,
            alignItems: "center",
          }}
        >
          <Link href="/" style={{ color: "#fff", fontWeight: 700, textDecoration: "none" }}>
            Agentic KYC
          </Link>
          <nav style={{ display: "flex", gap: 16 }}>
            <Link href="/" style={{ color: "#cbd5e1", textDecoration: "none" }}>
              Dashboard
            </Link>
            <Link href="/intake" style={{ color: "#cbd5e1", textDecoration: "none" }}>
              Intake
            </Link>
          </nav>
        </header>
        <main style={{ padding: "24px", maxWidth: 1200, margin: "0 auto" }}>{children}</main>
      </body>
    </html>
  );
}
