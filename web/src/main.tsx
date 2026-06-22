import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { FridayProvider } from "./store";
import { initTheme } from "./lib/theme";
import "./index.css"; // includes compact hljs token styles (rehype-highlight emits hljs-* classes)

initTheme();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <FridayProvider>
      <App />
    </FridayProvider>
  </React.StrictMode>,
);
