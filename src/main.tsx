import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import { ensureSeeded } from "./db/seed";
import { ToastProvider } from "./ui/toast";
import "./styles.css";

async function boot() {
  try {
    await ensureSeeded();
  } catch (err) {
    console.error("Fallo al inicializar la base de datos", err);
  }
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <HashRouter>
        <ToastProvider>
          <App />
        </ToastProvider>
      </HashRouter>
    </React.StrictMode>,
  );
}

boot();
