import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BottomNav } from "@/components/BottomNav";
import { BackendSettingsBridge } from "@/components/BackendSettingsBridge";
import { MotionProvider } from "@/components/MotionProvider";
import { ThemeApplier } from "@/components/ThemeApplier";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "German Bridge",
  description: "A polished German Bridge table for 3–12 players.",
  icons: {
    icon: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#061513",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="emerald" className="gb-game-viewport">
      <body>
        <Providers>
          <MotionProvider>
            <BackendSettingsBridge />
            <ThemeApplier />
            <main className="gb-app-main">{children}</main>
            <BottomNav />
          </MotionProvider>
        </Providers>
      </body>
    </html>
  );
}
