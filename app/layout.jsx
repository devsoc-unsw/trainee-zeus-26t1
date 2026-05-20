import "./globals.css";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import MenuBar from "@/components/desktop/MenuBar";
import Superbar from "@/components/desktop/Superbar";
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
            <MenuBar />
            <div className="window-area">
              <Bliss />
              <div className="window-stack">{children}</div>
            </div>
            <Superbar />
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
