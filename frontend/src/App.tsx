import { Navigate, Route, Routes } from "react-router-dom";

import AppShell from "./components/AppShell";
import RequireAuth from "./components/RequireAuth";
import { useStudioEvents } from "./hooks/useStudioEvents";
import DashboardPage from "./pages/DashboardPage";
import LoginPage from "./pages/LoginPage";
import StyleDemoPage from "./pages/StyleDemoPage";

function VideoDetailPlaceholder() {
  return (
    <p className="text-sm text-neutral-500">
      Detalhe do vídeo chega na S1-06 (revisão de roteiro).
    </p>
  );
}

export default function App() {
  useStudioEvents();

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <AppShell>
              <DashboardPage />
            </AppShell>
          </RequireAuth>
        }
      />
      <Route
        path="/video/:id"
        element={
          <RequireAuth>
            <AppShell>
              <VideoDetailPlaceholder />
            </AppShell>
          </RequireAuth>
        }
      />
      <Route
        path="/style"
        element={
          <RequireAuth>
            <AppShell>
              <StyleDemoPage />
            </AppShell>
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
