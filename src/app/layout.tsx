import type { Metadata } from "next";
import { Bricolage_Grotesque, Hanken_Grotesk } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { Flag } from "@/components/Flag";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-bricolage",
  display: "swap",
});
const body = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-hanken",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Office World Cup 2026 Pool",
  description: "Predict the 2026 FIFA World Cup and climb the office leaderboard.",
};

// Set the saved theme before paint to avoid a flash.
const THEME_INIT = `(function(){try{var t=localStorage.getItem('wc-theme');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="light" className={`${display.variable} ${body.variable}`}>
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        <div className="app">
          <Nav />
          <main className="content">{children}</main>
          <footer className="footer">
            Office World Cup 2026 Pool · 11 Jun – 19 Jul 2026{" "}
            <span className="flags" style={{ display: "inline-flex", gap: 4, verticalAlign: "middle", marginLeft: 4 }}>
              <Flag iso2="ca" name="Canada" size="sm" />
              <Flag iso2="mx" name="Mexico" size="sm" />
              <Flag iso2="us" name="USA" size="sm" />
            </span>
          </footer>
        </div>
      </body>
    </html>
  );
}
