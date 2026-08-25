import { Navigate, Route, Routes } from "react-router-dom";

import AppShell from "./components/AppShell";
import RequireAuth from "./components/RequireAuth";
import DashboardPage from "./pages/DashboardPage";
import LoginPage from "./pages/LoginPage";

function VideoDetailPlaceholder() {
  return (
    <p className="text-sm text-neutral-500">
      Detalhe do vídeo chega na S1-06 (revisão de roteiro).
    </p>
  );
}

export default function App() {
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
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
