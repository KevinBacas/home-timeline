import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "./globals.css";
export const metadata: Metadata = {
  title: "Home Timeline — The story of your home",
  description: "A quieter way to understand everything happening at home.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('ht-theme');document.documentElement.dataset.theme=t||'system'}catch(e){}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
