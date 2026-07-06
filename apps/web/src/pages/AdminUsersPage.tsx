import { CheckCircleOutlined, KeyOutlined, SearchOutlined, StopOutlined, TeamOutlined, UserSwitchOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Form, Input, Modal, Popconfirm, Space, Table, Tag, Tooltip, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { listAdminUsers, resetAdminUserPassword, updateAdminUser, type AdminUser } from '../api/admin';
import { GradientText } from '../components/effects/GradientText';
import { formatErrorMessage } from '../components/settings/settings-utils';
import { useAuth } from '../hooks/useAuth';

type ResetPasswordForm = {
  password: string;
  confirmPassword: string;
};

export function AdminUsersPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null);
  const [resetForm] = Form.useForm<ResetPasswordForm>();

  const users = useQuery({
    queryKey: ['admin-users', search],
    queryFn: () => listAdminUsers(search),
    enabled: user?.role === 'admin',
  });

  const updateUser = useMutation({
    mutationFn: ({ id, input }: { id: string; input: { role?: 'user' | 'admin'; disabled?: boolean } }) => updateAdminUser(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      message.success('账号状态已更新');
    },
    onError: (error) => message.error(`更新失败：${formatErrorMessage(error)}`),
  });

  const resetPassword = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) => resetAdminUserPassword(id, password),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      resetForm.resetFields();
      setResetTarget(null);
      message.success('密码已重置');
    },
    onError: (error) => message.error(`重置失败：${formatErrorMessage(error)}`),
  });

  if (user && user.role !== 'admin') return <Navigate to="/" replace />;

  const data = users.data?.users ?? [];
  const columns: ColumnsType<AdminUser> = [
    {
      title: '用户',
      dataIndex: 'email',
      render: (_, record) => (
        <Space direction="vertical" size={2} className="admin-user-identity">
          <Typography.Text strong>{record.displayName || record.email.split('@')[0]}</Typography.Text>
          <Typography.Text type="secondary">{record.email}</Typography.Text>
        </Space>
      ),
    },
    {
      title: '角色',
      dataIndex: 'role',
      width: 130,
      render: (role: AdminUser['role']) => (role === 'admin' ? <Tag color="geekblue">管理员</Tag> : <Tag>普通用户</Tag>),
    },
    {
      title: '状态',
      dataIndex: 'disabledAt',
      width: 130,
      render: (disabledAt: AdminUser['disabledAt']) =>
        disabledAt ? <Tag color="red">已禁用</Tag> : <Tag color="green">可使用</Tag>,
    },
    {
      title: '最近登录',
      dataIndex: 'lastLoginAt',
      width: 170,
      render: (value: AdminUser['lastLoginAt']) => (value ? formatDate(value) : '暂无'),
    },
    {
      title: '注册时间',
      dataIndex: 'createdAt',
      width: 170,
      render: (value: string) => formatDate(value),
    },
    {
      title: '操作',
      key: 'actions',
      width: 290,
      render: (_, record) => {
        const isSelf = record.id === user?.id;
        const disabled = Boolean(record.disabledAt);
        const isAdmin = record.role === 'admin';

        return (
          <Space wrap size={6} className="admin-user-actions">
            <Tooltip title={isSelf ? '不能修改自己的管理员角色' : isAdmin ? '设为普通用户' : '设为管理员'}>
              <Button
                size="small"
                icon={<UserSwitchOutlined />}
                disabled={isSelf}
                loading={updateUser.isPending && updateUser.variables?.id === record.id}
                onClick={() => updateUser.mutate({ id: record.id, input: { role: isAdmin ? 'user' : 'admin' } })}
              >
                {isAdmin ? '降为用户' : '设为管理员'}
              </Button>
            </Tooltip>
            <Popconfirm
              title={disabled ? '启用账号' : '禁用账号'}
              description={disabled ? '启用后该用户可以重新登录。' : '禁用后该用户将无法继续登录。'}
              okText={disabled ? '启用' : '禁用'}
              cancelText="取消"
              okButtonProps={{ danger: !disabled }}
              onConfirm={() => updateUser.mutate({ id: record.id, input: { disabled: !disabled } })}
              disabled={isSelf}
            >
              <Button
                size="small"
                danger={!disabled}
                disabled={isSelf}
                icon={disabled ? <CheckCircleOutlined /> : <StopOutlined />}
                loading={updateUser.isPending && updateUser.variables?.id === record.id}
              >
                {disabled ? '启用' : '禁用'}
              </Button>
            </Popconfirm>
            <Button size="small" icon={<KeyOutlined />} onClick={() => setResetTarget(record)}>
              重置密码
            </Button>
          </Space>
        );
      },
    },
  ];

  return (
    <>
      <div className="page-intro">
        <Typography.Title className="page-gradient-title" level={2}>
          <GradientText pauseOnHover>用户管理</GradientText>
        </Typography.Title>
        <Typography.Paragraph type="secondary">
          管理注册账号的登录状态和角色权限，不展示用户健康记录内容。
        </Typography.Paragraph>
      </div>

      <Card className="admin-users-card">
        <div className="admin-users-toolbar">
          <Space size={10} className="admin-users-heading">
            <span className="admin-users-heading-icon">
              <TeamOutlined />
            </span>
            <Typography.Text strong>注册用户</Typography.Text>
            <Tag color="blue">{data.length} 个账号</Tag>
          </Space>
          <Input.Search
            allowClear
            className="admin-users-search"
            enterButton={<SearchOutlined />}
            placeholder="搜索邮箱或昵称"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            onSearch={(value) => setSearch(value.trim())}
          />
        </div>

        <Table
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={users.isLoading}
          pagination={{ pageSize: 10, showSizeChanger: false }}
          scroll={{ x: 980 }}
        />
      </Card>

      <Modal
        destroyOnClose
        title={`重置密码：${resetTarget?.displayName || resetTarget?.email || ''}`}
        open={Boolean(resetTarget)}
        okText="确认重置"
        cancelText="取消"
        confirmLoading={resetPassword.isPending}
        onCancel={() => {
          resetForm.resetFields();
          setResetTarget(null);
        }}
        onOk={() => resetForm.submit()}
      >
        <Form
          form={resetForm}
          layout="vertical"
          onFinish={(values) => {
            if (!resetTarget) return;
            resetPassword.mutate({ id: resetTarget.id, password: values.password });
          }}
        >
          <Form.Item name="password" label="新密码" rules={[{ required: true, min: 8, message: '密码至少 8 位' }]}>
            <Input.Password autoComplete="new-password" placeholder="输入至少 8 位密码" />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label="确认新密码"
            dependencies={['password']}
            rules={[
              { required: true, message: '请再次输入新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) return Promise.resolve();
                  return Promise.reject(new Error('两次输入的新密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password autoComplete="new-password" placeholder="再次输入新密码" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
