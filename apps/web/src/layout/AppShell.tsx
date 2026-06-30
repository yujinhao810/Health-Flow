import {
  DashboardOutlined,
  HeartOutlined,
  LogoutOutlined,
  MedicineBoxOutlined,
  MessageOutlined,
  SettingOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Button, Layout, Menu, Spin, Typography } from 'antd';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { AuthPage } from '../pages/AuthPage';

const { Content, Sider } = Layout;

const items = [
  { key: '/', icon: <DashboardOutlined />, label: '总览' },
  { key: '/records', icon: <HeartOutlined />, label: '健康记录' },
  { key: '/chat', icon: <MessageOutlined />, label: '心理对话' },
  { key: '/diagnosis', icon: <MedicineBoxOutlined />, label: '辅助分诊' },
  { key: '/settings', icon: <SettingOutlined />, label: '模型设置' },
];

export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading, logout } = useAuth();
  const selectedKey = location.pathname.startsWith('/diagnosis') ? '/diagnosis' : location.pathname;

  if (loading) {
    return (
      <div className="app-loading">
        <Spin tip="正在确认登录状态..." />
      </div>
    );
  }

  if (!user) return <AuthPage />;

  return (
    <Layout style={{ minHeight: '100vh', background: 'transparent' }}>
      <Sider width={272} theme="light" className="app-sider">
        <div className="brand-panel">
          <Typography.Title level={4} className="brand-title">
            健康助手
          </Typography.Title>
          <Typography.Text className="brand-subtitle">温柔记录，慢慢变好</Typography.Text>
        </div>
        <Menu selectedKeys={[selectedKey]} mode="inline" items={items} onClick={({ key }) => navigate(key)} />
        <div className="account-panel">
          <div className="account-avatar">
            <UserOutlined />
          </div>
          <div className="account-copy">
            <Typography.Text strong>{user.displayName || user.email.split('@')[0]}</Typography.Text>
            <Typography.Text type="secondary">{user.email}</Typography.Text>
          </div>
          <Button type="text" icon={<LogoutOutlined />} onClick={logout} aria-label="退出登录" />
        </div>
      </Sider>
      <Layout style={{ background: 'transparent' }}>
        <Content className="app-content">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
