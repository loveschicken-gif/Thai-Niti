import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ไทยนิติ ท่องกฎหมาย",
  description: "เกมฝึกท่องจำกฎหมายไทยแบบเติมคำจากบทบัญญัติจริง",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
