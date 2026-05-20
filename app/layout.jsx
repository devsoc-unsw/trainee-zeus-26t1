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
        {/* Shown only on narrow viewports — the desktop UI assumes ≥900px.
            CSS in globals.css toggles which surface is visible. */}
        <div className="mobile-block" aria-hidden>
          <div className="mobile-block__card">
            <div className="mobile-block__glyph" aria-hidden>
              ⊟
            </div>
            <h1 className="mobile-block__title">Open on a laptop or desktop</h1>
            <p className="mobile-block__body">
              Code Telephone is designed for a wider screen. Please open this
              page on a device at least 900 pixels wide.
            </p>
          </div>
        </div>
      </body>
    </html>
  );
}
