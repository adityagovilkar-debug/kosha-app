import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { PREPAINT_SCRIPT } from "@/lib/theme";
import { APP_NAME, APP_DESCRIPTION, BRAND_COLOR } from "@/lib/brand";
import { NavShell } from "@/components/NavShell";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const spaceGrotesk = Space_Grotesk({ variable: "--font-space-grotesk", subsets: ["latin"] });

export const metadata: Metadata = {
  title: `${APP_NAME} — Personal Finance`,
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: APP_NAME },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0f1e" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} h-full`}
    >
      <head>
        {/* Apply saved theme before paint to avoid a flash. */}
        <script dangerouslySetInnerHTML={{ __html: PREPAINT_SCRIPT }} />
        <meta name="theme-color" content={BRAND_COLOR} />
      </head>
      <body className="min-h-full">
        <Providers>
          <NavShell>{children}</NavShell>
        </Providers>
      </body>
    </html>
  );
}
