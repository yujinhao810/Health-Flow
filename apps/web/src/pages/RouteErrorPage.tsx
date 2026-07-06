import { Alert, Button, Space } from 'antd';
import { isRouteErrorResponse, useRouteError } from 'react-router-dom';

export function RouteErrorPage() {
  const error = useRouteError();
  const message = getRouteErrorMessage(error);

  return (
    <main className="app-error-screen">
      <Alert
        type="error"
        showIcon
        message="页面暂时无法显示"
        description={message}
        action={
          <Space wrap>
            <Button size="small" onClick={() => window.location.reload()}>
              刷新页面
            </Button>
          </Space>
        }
      />
    </main>
  );
}

function getRouteErrorMessage(error: unknown) {
  if (isRouteErrorResponse(error)) return error.statusText || `请求失败：${error.status}`;
  if (error instanceof Error) return error.message;
  return '前端运行时出现未知错误，请刷新后重试。';
}
