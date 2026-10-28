import type { Metadata, Viewport } from "next";
import "./globals.css";
import { defaultGymConfig } from "@/config/gymConfig";

export const viewport: Viewport = {
  themeColor: "#181A20",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: `${defaultGymConfig.gymName} | Σύγχρονο Γυμναστήριο & Ψηφιακός Βοηθός Προπόνησης`,
  description: `${defaultGymConfig.description} Εξατομικευμένη προπονητική καθοδήγηση και ομαδικά προγράμματα.`,
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icons/icon.svg",
    apple: "/icons/icon.svg",
  },
  keywords: [
    "γυμναστήριο",
    "γυμναστήριο Αθήνα",
    "προπόνηση",
    "ψηφιακός προπονητής",
    "προπονητής",
    "πιλάτες",
    "γιόγκα",
    "πολεμικές τέχνες",
    "βάρη",
    "υπαίθρια προπόνηση",
    defaultGymConfig.gymName,
    defaultGymConfig.city,
  ],
  openGraph: {
    title: `${defaultGymConfig.gymName} - Γυμναστήριο & Ψηφιακός Βοηθός`,
    description: defaultGymConfig.tagline,
    type: "website",
    locale: "el_GR",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="el" className="dark">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="NexusFit" />
        <link rel="apple-touch-icon" href="/icons/icon.svg" />
        {/* Applies the saved preview theme before paint to avoid a flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var q=new URLSearchParams(location.search).get('theme');var t=(q==='sand'||q==='volt'||q==='coastal')?q:localStorage.getItem('nexusfit_theme_preview');if(t==='sand'||t==='volt'||t==='coastal'){document.documentElement.setAttribute('data-theme',t)}}catch(e){}",
          }}
        />
      </head>
      <body className="bg-background text-foreground antialiased selection:bg-accent selection:text-accent-ink">
        {children}
      </body>
    </html>
  );
}
