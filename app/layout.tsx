import type { Metadata, Viewport } from "next";
import { Poppins, Inter } from "next/font/google";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Qadri Mobile Communication",
  description: "Qadri Mobile Communication — phones & accessories, admin panel",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Qadri Mobile",
  },
  icons: {
    apple: "/icon-192x192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a56c4",
};

// Blocking, runs before first paint so a stored dark preference never flashes
// light first. No "system" branch on purpose: with no stored preference the
// app stays on its default light theme rather than following the OS.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    if (localStorage.getItem("qmc-theme") === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    }
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${poppins.variable} ${inter.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
