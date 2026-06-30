import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { AuthProvider } from './hooks/useAuth';
import { router } from './router';
import './styles.css';

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#6d5dfc',
          colorInfo: '#3b82f6',
          colorSuccess: '#38bdf8',
          colorBgBase: '#f3f0ff',
          colorBgLayout: '#f3f0ff',
          colorBgContainer: 'rgba(255, 255, 255, 0.74)',
          colorTextBase: '#1e1b4b',
          colorTextHeading: '#1e1b4b',
          colorBorder: 'rgba(129, 140, 248, 0.24)',
          borderRadius: 16,
          borderRadiusLG: 22,
          boxShadow: '0 18px 45px rgba(80, 70, 180, 0.12)',
          wireframe: false,
        },
        components: {
          Layout: {
            bodyBg: 'transparent',
            headerBg: 'rgba(255, 255, 255, 0.62)',
            siderBg: 'rgba(255, 255, 255, 0.58)',
          },
          Card: {
            borderRadiusLG: 22,
            boxShadowTertiary: '0 18px 45px rgba(80, 70, 180, 0.10)',
          },
          Button: {
            borderRadius: 999,
            primaryShadow: '0 10px 24px rgba(109, 93, 252, 0.26)',
          },
          Input: {
            borderRadius: 14,
          },
          InputNumber: {
            borderRadius: 14,
          },
          Select: {
            borderRadius: 14,
          },
          DatePicker: {
            borderRadius: 14,
          },
          Alert: {
            borderRadiusLG: 18,
          },
          Menu: {
            itemBorderRadius: 14,
            itemSelectedBg: 'rgba(109, 93, 252, 0.14)',
            itemSelectedColor: '#5b4ee6',
          },
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <AppErrorBoundary>
          <AuthProvider>
            <RouterProvider router={router} />
          </AuthProvider>
        </AppErrorBoundary>
      </QueryClientProvider>
    </ConfigProvider>
  </React.StrictMode>,
);
