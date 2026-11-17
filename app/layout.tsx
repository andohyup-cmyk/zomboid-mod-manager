import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Zomboid Mod Manager", template: "%s | Zomboid Mod Manager" },
  description: "Project Zomboid Build 42 모드 카탈로그와 서버 프로필 관리",
  manifest: "/manifest.webmanifest",
  applicationName: "Zomboid Mod Manager",
  appleWebApp: { capable: true, title: "PZ Mods" }
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b111a"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
