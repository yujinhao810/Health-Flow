import { LockOutlined, MailOutlined, UserOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Form, Input, Tabs, Typography, message } from 'antd';
import { useState } from 'react';
import type { LoginInput, RegisterInput } from '../api/auth';
import { Iridescence } from '../components/effects/Iridescence';
import { ShinyText } from '../components/effects/ShinyText';
import { useAuth } from '../hooks/useAuth';

export function AuthPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

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
        <Tabs
          className="auth-tabs"
          activeKey={mode}
          onChange={(key) => {
            setMode(key as 'login' | 'register');
            setError(undefined);
          }}
          items={[
            { key: 'login', label: '登录' },
            { key: 'register', label: '注册' },
          ]}
        />
        {error ? <Alert type="error" showIcon message={error} className="auth-alert" /> : null}
        {mode === 'login' ? (
          <Form className="auth-form" layout="vertical" onFinish={handleLogin} requiredMark={false}>
            <Form.Item name="email" label="邮箱" rules={[{ required: true, type: 'email', message: '请输入有效邮箱' }]}>
              <Input prefix={<MailOutlined />} autoComplete="email" placeholder="you@example.com" />
            </Form.Item>
            <Form.Item name="password" label="密码" rules={[{ required: true, min: 8, message: '密码至少 8 位' }]}>
              <Input.Password prefix={<LockOutlined />} autoComplete="current-password" placeholder="输入密码" />
            </Form.Item>
            <Button className="auth-submit" type="primary" htmlType="submit" loading={loading} block>
              登录
            </Button>
          </Form>
        ) : (
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
        )}
      </Card>
    </main>
  );
}
