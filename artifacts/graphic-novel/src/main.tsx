import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

// Register a service worker so Chrome/Edge expose the "Install app" button
// on Windows, macOS, and Android. iOS Safari ignores this and uses the
// apple-touch-icon + meta tags instead. The worker itself is a no-op pass-
// through (see public/sw.js) — we just need one to exist for installability.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, {
        scope: import.meta.env.BASE_URL,
      })
      .catch((err) => {
        console.warn("Service worker registration failed:", err);
      });
  });
}
