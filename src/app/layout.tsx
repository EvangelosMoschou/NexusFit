import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { defaultGymConfig } from "@/config/gymConfig";
import { getRepository } from "@/lib/db";
import { resolveTenantIdFromHeaders } from "@/lib/tenants";
import { GymConfigProvider } from "@/components/GymConfigProvider";
import type { GymConfig } from "@/types";

export const viewport: Viewport = {
  themeColor: "#181A20",
  width: "device-width",
  initialScale: 1,
};

async function loadTenantGymConfig(): Promise<GymConfig> {
  const reqHeaders = await headers();
  const tenantId = resolveTenantIdFromHeaders(reqHeaders);
  try {
    return await getRepository(tenantId).getGymConfig();
  } catch {
    return defaultGymConfig;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const config = await loadTenantGymConfig();
  return {
    metadataBase: process.env.NEXT_PUBLIC_SITE_URL
      ? new URL(process.env.NEXT_PUBLIC_SITE_URL)
      : undefined,
    title: `${config.gymName} | Σύγχρονο Γυμναστήριο & Ψηφιακός Βοηθός Προπόνησης`,
    description: `${config.description} Εξατομικευμένη προπονητική καθοδήγηση και ομαδικά προγράμματα.`,
    manifest: "/manifest.webmanifest",
    icons: {
      icon: "/icons/icon.svg",
      apple: "/icons/icon.svg",
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: config.gymName,
    },
    keywords: [
      "γυμναστήριο",
      `γυμναστήριο ${config.city}`,
      "προπόνηση",
      "ψηφιακός προπονητής",
      "προπονητής",
      "πιλάτες",
      "γιόγκα",
      "πολεμικές τέχνες",
      "βάρη",
      "υπαίθρια προπόνηση",
      config.gymName,
      config.city,
    ],
    openGraph: {
      title: `${config.gymName} - Γυμναστήριο & Ψηφιακός Βοηθός`,
      description: config.tagline,
      type: "website",
      locale: "el_GR",
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const config = await loadTenantGymConfig();
  return (
    <html lang="el" className="dark">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon.svg" />
        {/* Applies the saved preview theme before paint to avoid a flash.
            Omitted only when the build disables the preview with 0. */}
        {process.env.NEXT_PUBLIC_THEME_PREVIEW !== "0" && (
          <script
            dangerouslySetInnerHTML={{
              __html:
                "try{var q=new URLSearchParams(location.search).get('theme');var t=(q==='sand'||q==='volt'||q==='coastal')?q:localStorage.getItem('nexusfit_theme_preview');if(t==='sand'||t==='volt'||t==='coastal'){document.documentElement.setAttribute('data-theme',t)}}catch(e){}",
            }}
          />
        )}
      </head>
      <body className="bg-background text-foreground antialiased selection:bg-accent selection:text-accent-ink">
        <GymConfigProvider initialConfig={config}>{children}</GymConfigProvider>
      </body>
    </html>
  );
}
