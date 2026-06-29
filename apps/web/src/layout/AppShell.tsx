import { DashboardOutlined, HeartOutlined, MedicineBoxOutlined, MessageOutlined, SettingOutlined } from '@ant-design/icons';
import { Layout, Menu, Typography } from 'antd';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

const { Content, Sider } = Layout;

const items = [
  { key: '/', icon: <DashboardOutlined />, label: '总览' },
  { key: '/records', icon: <HeartOutlined />, label: '健康记录' },
  { key: '/chat', icon: <MessageOutlined />, label: '心理对话' },
  { key: '/diagnosis', icon: <MedicineBoxOutlined />, label: '辅助分诊' },
  { key: '/snapshots', icon: <DashboardOutlined />, label: '健康快照' },
  { key: '/settings', icon: <SettingOutlined />, label: '模型设置' },
];

export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const selectedKey = location.pathname.startsWith('/diagnosis') ? '/diagnosis' : location.pathname;

  return (
    <Layout style={{ minHeight: '100vh', background: 'transparent' }}>
      <Sider width={232} theme="light" className="app-sider">
        <div className="brand-panel">
          <Typography.Title level={4} className="brand-title">
            健康助手
          </Typography.Title>
          <Typography.Text className="brand-subtitle">温柔记录，慢慢变好</Typography.Text>
        </div>
        <Menu selectedKeys={[selectedKey]} mode="inline" items={items} onClick={({ key }) => navigate(key)} />
      </Sider>
      <Layout style={{ background: 'transparent' }}>
        <Content className="app-content">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
