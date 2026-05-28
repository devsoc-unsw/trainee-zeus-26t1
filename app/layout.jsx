import "./globals.css";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import Bliss from "@/components/wallpaper/Bliss";

export const metadata = {
  title: "Code Telephone",
  description: "A multiplayer coding game in the spirit of Telephone.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <div className="desktop-root">
            <div className="window-area">
              <Bliss />
              <div className="window-stack">{children}</div>
            </div>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
