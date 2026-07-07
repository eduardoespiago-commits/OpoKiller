import { useEffect } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { ErrorBoundary } from "./ui/ErrorBoundary";
import { useSettings } from "./hooks/useData";
import { Today } from "./screens/Today";
import { Plan } from "./screens/Plan";
import { CalendarScreen } from "./screens/CalendarScreen";
import { Temario } from "./screens/Temario";
import { Reviews } from "./screens/Reviews";
import { TestsScreen } from "./screens/TestsScreen";
import { Errors } from "./screens/Errors";
import { Sessions } from "./screens/Sessions";
import { Materials } from "./screens/Materials";
import { Stats } from "./screens/Stats";
import { Settings } from "./screens/Settings";
import { Onboarding } from "./screens/Onboarding";

const NAV = [
  { to: "/hoy", label: "Hoy", ico: "☀️" },
  { to: "/plan", label: "Plan", ico: "🧭" },
  { to: "/calendario", label: "Calendario", ico: "📅" },
  { to: "/temario", label: "Temario", ico: "📚" },
  { to: "/repasos", label: "Repasos", ico: "🔁" },
  { to: "/tests", label: "Tests", ico: "📝" },
  { to: "/errores", label: "Errores", ico: "⚠️" },
  { to: "/sesiones", label: "Sesiones", ico: "⏱️" },
  { to: "/materiales", label: "Materiales", ico: "📥" },
  { to: "/estadisticas", label: "Estadísticas", ico: "📊" },
  { to: "/ajustes", label: "Ajustes", ico: "⚙️" },
];

export default function App() {
  const settings = useSettings();

  useEffect(() => {
    const theme = settings.theme;
    if (theme === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", theme);
  }, [settings.theme]);

  if (!settings.onboarded) {
    return <Onboarding />;
  }

  return (
    <div className="app-shell">
      <nav className="nav" aria-label="Navegación principal">
        <div className="nav-brand hidden-mobile" style={{ display: "none" }} />
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
          >
            <span className="ico" aria-hidden>
              {n.ico}
            </span>
            <span>{n.label}</span>
          </NavLink>
        ))}
      </nav>
      <main className="app-main">
        <ErrorBoundary>
        <Routes>
          <Route path="/" element={<Navigate to="/hoy" replace />} />
          <Route path="/hoy" element={<Today />} />
          <Route path="/plan" element={<Plan />} />
          <Route path="/calendario" element={<CalendarScreen />} />
          <Route path="/temario" element={<Temario />} />
          <Route path="/repasos" element={<Reviews />} />
          <Route path="/tests" element={<TestsScreen />} />
          <Route path="/errores" element={<Errors />} />
          <Route path="/sesiones" element={<Sessions />} />
          <Route path="/materiales" element={<Materials />} />
          <Route path="/estadisticas" element={<Stats />} />
          <Route path="/ajustes" element={<Settings />} />
          <Route path="*" element={<Navigate to="/hoy" replace />} />
        </Routes>
        </ErrorBoundary>
      </main>
    </div>
  );
}
