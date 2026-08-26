import { Navigate, Route, Routes } from "react-router-dom";

import AppShell from "./components/AppShell";
import RequireAuth from "./components/RequireAuth";
import { useStudioEvents } from "./hooks/useStudioEvents";
import DashboardPage from "./pages/DashboardPage";
import LoginPage from "./pages/LoginPage";
import ScriptReviewPage from "./pages/ScriptReviewPage";
import StyleDemoPage from "./pages/StyleDemoPage";
import LandmarkerDevPage from "./pages/LandmarkerDevPage";
import AvatarDevPage from "./pages/AvatarDevPage";
import MicDevPage from "./pages/MicDevPage";
import TeleprompterDevPage from "./pages/TeleprompterDevPage";
import RecorderDevPage from "./pages/RecorderDevPage";
import PlayerDevPage from "./pages/PlayerDevPage";
import StudioRecordingPage from "./pages/StudioRecordingPage";
import VoicePreviewPage from "./pages/VoicePreviewPage";
import ScenesReviewPage from "./pages/ScenesReviewPage";

export default function App() {
  useStudioEvents();

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/dev/landmarker" element={<LandmarkerDevPage />} />
      <Route path="/dev/avatar" element={<AvatarDevPage />} />
      <Route path="/dev/mic" element={<MicDevPage />} />
      <Route path="/dev/teleprompter" element={<TeleprompterDevPage />} />
      <Route path="/dev/recorder" element={<RecorderDevPage />} />
      <Route path="/dev/player" element={<PlayerDevPage />} />
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
        path="/videos/:slug/studio"
        element={
          <RequireAuth>
            <AppShell>
              <StudioRecordingPage />
            </AppShell>
          </RequireAuth>
        }
      />
      <Route
        path="/videos/:id"
        element={
          <RequireAuth>
            <AppShell>
              <ScriptReviewPage />
            </AppShell>
          </RequireAuth>
        }
      />
      <Route
        path="/videos/:id/voz"
        element={
          <RequireAuth>
            <AppShell>
              <VoicePreviewPage />
            </AppShell>
          </RequireAuth>
        }
      />
      <Route
        path="/videos/:id/scenes"
        element={
          <RequireAuth>
            <AppShell>
              <ScenesReviewPage />
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
