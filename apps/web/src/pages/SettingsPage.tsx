import { ApiOutlined, DatabaseOutlined, SkinOutlined, UserOutlined } from '@ant-design/icons';
import { Card, Tabs, Typography } from 'antd';
import { useSearchParams } from 'react-router-dom';
import { AppearanceTab } from '../components/settings/AppearanceTab';
import { DataTab } from '../components/settings/DataTab';
import { ModelConfigTab } from '../components/settings/ModelConfigTab';
import { ProfileTab } from '../components/settings/ProfileTab';

const settingsTabKeys = new Set(['profile', 'model', 'data', 'appearance']);

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab') ?? 'profile';
  const activeKey = settingsTabKeys.has(requestedTab) ? requestedTab : 'profile';

  function handleTabChange(key: string) {
    setSearchParams(key === 'profile' ? {} : { tab: key });
  }

  return (
    <>
      <div className="page-intro">
        <Typography.Title level={2}>个人设置</Typography.Title>
        <Typography.Paragraph type="secondary">
          管理你的个人资料、模型能力、健康数据和界面偏好。
        </Typography.Paragraph>
      </div>
      <Card className="settings-card">
        <Tabs
          activeKey={activeKey}
          onChange={handleTabChange}
          items={[
            {
              key: 'profile',
              label: <span className="settings-tab-label"><UserOutlined />个人信息</span>,
              children: <ProfileTab />,
            },
            {
              key: 'model',
              label: <span className="settings-tab-label"><ApiOutlined />模型配置</span>,
              children: <ModelConfigTab />,
            },
            {
              key: 'data',
              label: <span className="settings-tab-label"><DatabaseOutlined />健康数据</span>,
              children: <DataTab />,
            },
            {
              key: 'appearance',
              label: <span className="settings-tab-label"><SkinOutlined />外观偏好</span>,
              children: <AppearanceTab />,
            },
          ]}
        />
      </Card>
    </>
  );
}
