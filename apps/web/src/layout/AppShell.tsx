import {
  DashboardOutlined,
  HeartOutlined,
  LogoutOutlined,
  MedicineBoxOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MessageOutlined,
  SettingOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Button, Layout, Menu, Spin, Tooltip, Typography } from 'antd';
import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { AuthPage } from '../pages/AuthPage';

const { Content, Sider } = Layout;

const navItems = [
  { key: '/', icon: <DashboardOutlined />, label: '总览' },
  { key: '/records', icon: <HeartOutlined />, label: '健康记录' },
  { key: '/chat', icon: <MessageOutlined />, label: '心理对话' },
  { key: '/diagnosis', icon: <MedicineBoxOutlined />, label: '辅助分诊' },
  { key: '/settings', icon: <SettingOutlined />, label: '模型设置' },
];

const menuItems = navItems.map((item) => ({ key: item.key, icon: item.icon, label: item.label }));

export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
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
      <Sider
        width={272}
        collapsedWidth={88}
        collapsed={collapsed}
        trigger={null}
        theme="light"
        className={collapsed ? 'app-sider app-sider-collapsed' : 'app-sider'}
      >
        <div className="brand-panel">
          <div className="brand-row">
            {collapsed ? (
              <div className="brand-mark" aria-label="健康助手">健</div>
            ) : (
              <div className="brand-copy">
                <Typography.Title level={4} className="brand-title">
                  健康助手
                </Typography.Title>
                <Typography.Text className="brand-subtitle">温柔记录，慢慢变好</Typography.Text>
              </div>
            )}
            <Tooltip title={collapsed ? '展开侧边栏' : '折叠侧边栏'} placement="right">
              <Button
                type="text"
                className="sider-collapse-btn"
                icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                onClick={() => setCollapsed((value) => !value)}
                aria-label={collapsed ? '展开侧边栏' : '折叠侧边栏'}
              />
            </Tooltip>
          </div>
        </div>
        {collapsed ? (
          <nav className="compact-nav" aria-label="主导航">
            {navItems.map((item) => (
              <Tooltip key={item.key} title={item.label} placement="right">
                <Button
                  type="text"
                  className={item.key === selectedKey ? 'compact-nav-item active' : 'compact-nav-item'}
                  icon={item.icon}
                  onClick={() => navigate(item.key)}
                  aria-label={item.label}
                />
              </Tooltip>
            ))}
          </nav>
        ) : (
          <Menu selectedKeys={[selectedKey]} mode="inline" items={menuItems} onClick={({ key }) => navigate(key)} />
        )}
        <div className="account-panel">
          <div className="account-avatar">
            <UserOutlined />
          </div>
          {!collapsed ? (
            <div className="account-copy">
              <Typography.Text strong>{user.displayName || user.email.split('@')[0]}</Typography.Text>
              <Typography.Text type="secondary">{user.email}</Typography.Text>
            </div>
          ) : null}
          <Tooltip title="退出登录" placement="right">
            <Button type="text" icon={<LogoutOutlined />} onClick={logout} aria-label="退出登录" />
          </Tooltip>
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