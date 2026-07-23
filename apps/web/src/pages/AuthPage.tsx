import { ArrowLeftOutlined, KeyOutlined, LockOutlined, MailOutlined, UserOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Form, Input, Tabs, Typography, message } from 'antd';
import { useState } from 'react';
import {
  requestPasswordReset,
  resetPassword,
  type ForgotPasswordInput,
  type LoginInput,
  type RegisterInput,
} from '../api/auth';
import { Iridescence } from '../components/effects/Iridescence';
import { ShinyText } from '../components/effects/ShinyText';
import { useAuth } from '../hooks/useAuth';

type AuthMode = 'login' | 'register' | 'forgot' | 'reset';

type ResetPasswordForm = {
  token?: string;
  newPassword: string;
  confirmPassword: string;
};

const initialResetToken = new URLSearchParams(window.location.search).get('resetToken');

export function AuthPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<AuthMode>(initialResetToken ? 'reset' : 'login');
  const [resetToken, setResetToken] = useState(initialResetToken || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError(undefined);
    setNotice(undefined);
  }

  async function handleLogin(values: LoginInput) {
    setLoading(true);
    setError(undefined);
    try {
      await login(values);
      message.success('欢迎回来');
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : '登录失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(values: RegisterInput) {
    setLoading(true);
    setError(undefined);
    try {
      await register(values);
      message.success('账号已创建');
    } catch (registerError) {
      setError(registerError instanceof Error ? registerError.message : '注册失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword(values: ForgotPasswordInput) {
    setLoading(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const result = await requestPasswordReset(values);
      setNotice(result.message);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '暂时无法发送重置邮件，请稍后重试');
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword(values: ResetPasswordForm) {
    const submittedToken = resetToken || values.token?.trim();
    if (!submittedToken) {
      setError('请输入邮件中的重置码');
      return;
    }

    setLoading(true);
    setError(undefined);
    try {
      await resetPassword({ token: submittedToken, newPassword: values.newPassword });
      const url = new URL(window.location.href);
      url.searchParams.delete('resetToken');
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
      setResetToken('');
      changeMode('login');
      setNotice('密码已重置，请使用新密码登录');
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : '密码重置失败，请重新申请');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-screen">
      <Iridescence color={[0.92, 0.96, 1]} speed={0.82} amplitude={0.22} aria-hidden="true" />
      <section className="auth-intro">
        <Typography.Title className="auth-brand">
          <ShinyText
            text="HealthFlow：智慧健康助手"
            className="auth-brand-shine"
            color="#1d4ed8"
            shineColor="#ffffff"
            speed={2.8}
            spread={112}
            yoyo
            pauseOnHover
          />
        </Typography.Title>
      </section>
      <Card className="auth-card">
        {mode === 'login' || mode === 'register' ? (
          <Tabs
            className="auth-tabs"
            activeKey={mode}
            onChange={(key) => changeMode(key as 'login' | 'register')}
            items={[
              { key: 'login', label: '登录' },
              { key: 'register', label: '注册' },
            ]}
          />
        ) : (
          <div className="auth-mode-header">
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              onClick={() => changeMode('login')}
              aria-label="返回登录"
              title="返回登录"
            />
            <div>
              <Typography.Title level={3}>{mode === 'forgot' ? '找回密码' : '设置新密码'}</Typography.Title>
              <Typography.Text>
                {mode === 'forgot' ? '输入注册邮箱，我们会发送一封重置邮件。' : '请输入新的登录密码。'}
              </Typography.Text>
            </div>
          </div>
        )}

        {error ? <Alert type="error" showIcon message={error} className="auth-alert" /> : null}
        {notice ? <Alert type="success" showIcon message={notice} className="auth-alert auth-success" /> : null}

        {mode === 'login' ? (
          <Form className="auth-form" layout="vertical" onFinish={handleLogin} requiredMark={false}>
            <Form.Item name="email" label="邮箱" rules={[{ required: true, type: 'email', message: '请输入有效邮箱' }]}>
              <Input prefix={<MailOutlined />} autoComplete="email" placeholder="you@example.com" />
            </Form.Item>
            <Form.Item name="password" label="密码" rules={[{ required: true, min: 8, message: '密码至少 8 位' }]}>
              <Input.Password prefix={<LockOutlined />} autoComplete="current-password" placeholder="输入密码" />
            </Form.Item>
            <div className="auth-secondary-action">
              <Button type="link" onClick={() => changeMode('forgot')}>
                忘记密码？
              </Button>
            </div>
            <Button className="auth-submit" type="primary" htmlType="submit" loading={loading} block>
              登录
            </Button>
          </Form>
        ) : null}

        {mode === 'register' ? (
          <Form className="auth-form" layout="vertical" onFinish={handleRegister} requiredMark={false}>
            <Form.Item name="displayName" label="昵称">
              <Input prefix={<UserOutlined />} autoComplete="name" placeholder="给自己一个容易认出的名字" />
            </Form.Item>
            <Form.Item name="email" label="邮箱" rules={[{ required: true, type: 'email', message: '请输入有效邮箱' }]}>
              <Input prefix={<MailOutlined />} autoComplete="email" placeholder="you@example.com" />
            </Form.Item>
            <Form.Item name="password" label="密码" rules={[{ required: true, min: 8, message: '密码至少 8 位' }]}>
              <Input.Password prefix={<LockOutlined />} autoComplete="new-password" placeholder="至少 8 位密码" />
            </Form.Item>
            <Button className="auth-submit" type="primary" htmlType="submit" loading={loading} block>
              创建账号
            </Button>
          </Form>
        ) : null}

        {mode === 'forgot' ? (
          <Form className="auth-form" layout="vertical" onFinish={handleForgotPassword} requiredMark={false}>
            <Form.Item name="email" label="注册邮箱" rules={[{ required: true, type: 'email', message: '请输入有效邮箱' }]}>
              <Input prefix={<MailOutlined />} autoComplete="email" placeholder="you@example.com" />
            </Form.Item>
            <Button className="auth-submit" type="primary" htmlType="submit" loading={loading} block>
              发送重置邮件
            </Button>
            <div className="auth-code-action">
              <Button type="link" icon={<KeyOutlined />} onClick={() => changeMode('reset')}>
                输入邮件中的重置码
              </Button>
            </div>
          </Form>
        ) : null}

        {mode === 'reset' ? (
          <Form className="auth-form" layout="vertical" onFinish={handleResetPassword} requiredMark={false}>
            {!resetToken ? (
              <Form.Item
                name="token"
                label="重置码"
                rules={[
                  { required: true, message: '请输入邮件中的重置码' },
                  { min: 32, message: '重置码格式不正确' },
                ]}
              >
                <Input prefix={<KeyOutlined />} autoComplete="one-time-code" placeholder="粘贴邮件中的重置码" />
              </Form.Item>
            ) : null}
            <Form.Item name="newPassword" label="新密码" rules={[{ required: true, min: 8, message: '密码至少 8 位' }]}>
              <Input.Password prefix={<LockOutlined />} autoComplete="new-password" placeholder="至少 8 位密码" />
            </Form.Item>
            <Form.Item
              name="confirmPassword"
              label="确认新密码"
              dependencies={['newPassword']}
              rules={[
                { required: true, message: '请再次输入新密码' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('newPassword') === value) return Promise.resolve();
                    return Promise.reject(new Error('两次输入的密码不一致'));
                  },
                }),
              ]}
            >
              <Input.Password prefix={<LockOutlined />} autoComplete="new-password" placeholder="再次输入新密码" />
            </Form.Item>
            <Button className="auth-submit" type="primary" htmlType="submit" loading={loading} block>
              重置密码
            </Button>
          </Form>
        ) : null}
      </Card>
    </main>
  );
}
