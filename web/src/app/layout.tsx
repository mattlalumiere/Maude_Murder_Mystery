import type { Metadata, Viewport } from "next";
import "./globals.css";
import { RegisterServiceWorker } from "../components/ui/RegisterServiceWorker";

export const metadata: Metadata = {
  title: "Murder Mystery Night",
  description: "A family whodunit party game with a secret-keeping AI Game Master.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  appleWebApp: { capable: true, title: "Mystery Night", statusBarStyle: "black-translucent" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0e0b12",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
