import { Alert } from 'antd';
import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
};

type State = {
  error?: Error;
  errorInfo?: ErrorInfo;
};

export class AppErrorBoundary extends Component<Props, State> {
  state: State = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ error, errorInfo });
    console.error(error, errorInfo);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="app-error-screen">
        <Alert
          type="error"
          showIcon
          message="页面渲染失败"
          description={this.state.error.message || '前端运行时出现未知错误，请查看控制台。'}
        />
        {this.state.errorInfo?.componentStack ? (
          <pre className="app-error-stack">{this.state.errorInfo.componentStack}</pre>
        ) : null}
      </main>
    );
  }
}
