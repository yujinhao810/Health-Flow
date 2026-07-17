import { DesktopOutlined, MoonOutlined, SunOutlined } from '@ant-design/icons';
import { Segmented, Space, Typography, message } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { updatePreferences } from '../../api/auth';
import { useAuth } from '../../hooks/useAuth';
import { useTheme, type ThemeMode } from '../../theme/ThemeProvider';
import { formatErrorMessage } from './settings-utils';

const THEME_OPTIONS = [
  {
    label: <span className="theme-mode-option"><SunOutlined />浅色</span>,
    value: 'light',
  },
  {
    label: <span className="theme-mode-option"><MoonOutlined />深色</span>,
    value: 'dark',
  },
  {
    label: <span className="theme-mode-option"><DesktopOutlined />跟随系统</span>,
    value: 'system',
  },
];

export function AppearanceTab() {
  const { refreshUser } = useAuth();
  const { themeMode, resolvedTheme, setThemeMode } = useTheme();

  const savePreference = useMutation({
    mutationFn: (mode: ThemeMode) => updatePreferences({ themeMode: mode }),
    onMutate: (nextMode) => {
      const previousMode = themeMode;
      setThemeMode(nextMode);
      return { previousMode };
    },
    onSuccess: async () => {
      await refreshUser();
    },
    onError: (error, _mode, context) => {
      if (context?.previousMode) setThemeMode(context.previousMode);
      message.error(`主题保存失败：${formatErrorMessage(error)}`);
    },
  });

  function handleThemeChange(value: string | number) {
    const nextMode = String(value) as ThemeMode;
    if (nextMode === themeMode || savePreference.isPending) return;
    savePreference.mutate(nextMode);
  }

  const activeLabel = resolvedTheme === 'dark' ? '深色' : '浅色';
  const status =
    themeMode === 'system'
      ? `跟随系统，当前为${activeLabel}模式`
      : `当前使用${activeLabel}模式`;

  return (
    <div className="settings-tab-panel appearance-settings-panel">
      <Typography.Title level={4}>主题模式</Typography.Title>
      <Segmented
        block
        className="theme-mode-control"
        value={themeMode}
        options={THEME_OPTIONS}
        disabled={savePreference.isPending}
        onChange={handleThemeChange}
      />
      <Space size={8} className="theme-mode-status">
        <span className={`theme-status-dot ${resolvedTheme}`} aria-hidden="true" />
        <Typography.Text type="secondary">
          {savePreference.isPending ? '正在同步主题偏好…' : status}
        </Typography.Text>
      </Space>
    </div>
  );
}
