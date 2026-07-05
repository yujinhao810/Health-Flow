import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from './layout/AppShell';
import { AgentRunDetailPage } from './pages/AgentRunDetailPage';
import { ChatPage } from './pages/ChatPage';
import { DashboardPage } from './pages/DashboardPage';
import { DiagnosisDetailPage } from './pages/DiagnosisDetailPage';
import { DiagnosisPage } from './pages/DiagnosisPage';
import { RecordsPage } from './pages/RecordsPage';
import { SettingsPage } from './pages/SettingsPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'records', element: <RecordsPage /> },
      { path: 'chat', element: <ChatPage /> },
      { path: 'diagnosis', element: <DiagnosisPage /> },
      { path: 'diagnosis/:id', element: <DiagnosisDetailPage /> },
      { path: 'agent-runs/:id', element: <AgentRunDetailPage /> },
      { path: 'snapshots', element: <Navigate to="/" replace /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
]);
