import "./globals.css";
import Superbar from "@/components/desktop/Superbar";
import GameRouter from "@/components/socket/GameRouter";

export const metadata = {
  title: "Code Telephone",
  description: "A multiplayer coding game in the spirit of Telephone.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <GameRouter />
        <div className="desktop-root">
          <div className="window-area">{children}</div>
          <Superbar />
        </div>
      </body>
    </html>
  );
}
