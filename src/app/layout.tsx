import type { Metadata, Viewport } from "next";
import { Instrument_Sans, Martian_Mono, Michroma } from "next/font/google";
import { AuthProvider } from "@/components/auth";
import { RegisterServiceWorker } from "@/components/RegisterServiceWorker";
import { asset } from "@/lib/env";
import "./globals.css";

const michroma = Michroma({ variable: "--font-michroma", weight: "400", subsets: ["latin"] });
const instrument = Instrument_Sans({ variable: "--font-instrument", subsets: ["latin"] });
const martian = Martian_Mono({ variable: "--font-martian", subsets: ["latin"], weight: ["300", "400", "500"] });

export const metadata: Metadata = {
  title: "RECALL",
  description: "Spaced repetition, tailored.",
  applicationName: "RECALL",
  appleWebApp: { capable: true, title: "RECALL", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: asset("/icons/favicon.svg"), type: "image/svg+xml" },
      { url: asset("/icons/icon-192.png"), sizes: "192x192", type: "image/png" },
    ],
    apple: asset("/icons/apple-touch-icon.png"),
  },
};

export const viewport: Viewport = {
  themeColor: "#06070A",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${michroma.variable} ${instrument.variable} ${martian.variable}`}>
      <body className="min-h-dvh">
        <AuthProvider>{children}</AuthProvider>
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
