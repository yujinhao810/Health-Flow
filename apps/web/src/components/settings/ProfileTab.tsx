import { Avatar, Button, Col, Form, Input, InputNumber, Popconfirm, Row, Select, Space, Typography, message } from 'antd';
import type { FormInstance } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, type ChangeEvent } from 'react';
import { deleteAccount, changePassword, getAvatarImageSrc, updateProfile, uploadAvatar, type UserProfile } from '../../api/auth';
import { useAuth } from '../../hooks/useAuth';
import { formatErrorMessage } from './settings-utils';

type ProfileFormValues = {
  displayName?: string;
  bio?: string;
  email?: string;
  birthYear?: number;
  gender?: string;
  heightCm?: number;
  weightKg?: number;
};

type PasswordFormValues = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

export function ProfileTab() {
  const { user, logout, refreshUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [profileForm] = Form.useForm<ProfileFormValues>();
  const [passwordForm] = Form.useForm<PasswordFormValues>();
  const heightCm = Form.useWatch('heightCm', profileForm);
  const weightKg = Form.useWatch('weightKg', profileForm);
  const bmi = calculateBmi(heightCm, weightKg);

  useEffect(() => {
    if (user) hydrateProfileForm(profileForm, user);
  }, [profileForm, user]);

  const saveProfile = useMutation({
    mutationFn: (values: ProfileFormValues) => {
      const { email: _email, ...profile } = values;
      return updateProfile(profile as Partial<UserProfile>);
    },
    onSuccess: async () => {
      const refreshed = await refreshUser();
      if (refreshed) hydrateProfileForm(profileForm, refreshed);
      message.success('个人资料已保存');
    },
    onError: (error) => message.error(`保存失败：${formatErrorMessage(error)}`),
  });

  const avatar = useMutation({
    mutationFn: uploadAvatar,
    onSuccess: async () => {
      const refreshed = await refreshUser();
      if (refreshed) hydrateProfileForm(profileForm, refreshed);
      message.success('头像已更新');
    },
    onError: (error) => message.error(`头像上传失败：${formatErrorMessage(error)}`),
  });

  const password = useMutation({
    mutationFn: (values: PasswordFormValues) =>
      changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      }),
    onSuccess: () => {
      passwordForm.resetFields();
      message.success('密码已更新');
    },
    onError: (error) => message.error(`修改失败：${formatErrorMessage(error)}`),
  });

  const removeAccount = useMutation({
    mutationFn: deleteAccount,
    onSuccess: () => {
      message.success('账号已删除');
      logout();
    },
    onError: (error) => message.error(`删除失败：${formatErrorMessage(error)}`),
  });

  if (!user) return null;
  const avatarSrc = getAvatarImageSrc(user.avatarUrl);

  return (
    <div className="settings-tab-panel">
      <div className="settings-avatar-section">
        <Avatar size={80} src={avatarSrc} className="settings-avatar-preview">
          {getAvatarInitial(user)}
        </Avatar>
        <Space direction="vertical" size={4}>
          <Typography.Text strong>{user.displayName || user.email.split('@')[0]}</Typography.Text>
          <Typography.Text type="secondary">{user.email}</Typography.Text>
          <Button size="small" loading={avatar.isPending} onClick={() => fileInputRef.current?.click()}>
            修改头像
          </Button>
          <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={handleAvatarFileChange} />
        </Space>
      </div>

      <Form form={profileForm} layout="vertical" onFinish={(values) => saveProfile.mutate(values)} initialValues={profileInitialValues(user)}>
        <div className="settings-section-divider">
          <div className="settings-section-title">基本信息</div>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item name="displayName" label="昵称" rules={[{ max: 80, message: '昵称最多 80 个字符' }]}>
                <Input maxLength={80} placeholder="怎么称呼你" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="email" label="邮箱" extra="邮箱暂不支持修改">
                <Input disabled />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="bio" label="个人简介" rules={[{ max: 200, message: '简介最多 200 个字符' }]}>
                <Input.TextArea maxLength={200} rows={3} showCount placeholder="写几句话介绍自己" />
              </Form.Item>
            </Col>
          </Row>
        </div>

        <div className="settings-section-divider">
          <div className="settings-section-title">健康档案</div>
          <Row gutter={16}>
            <Col xs={24} md={12} lg={6}>
              <Form.Item name="birthYear" label="出生年份">
                <InputNumber min={1900} max={2020} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12} lg={6}>
              <Form.Item name="gender" label="性别">
                <Select
                  allowClear
                  options={[
                    { label: '男', value: 'male' },
                    { label: '女', value: 'female' },
                    { label: '其他', value: 'other' },
                    { label: '不愿透露', value: 'private' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12} lg={6}>
              <Form.Item name="heightCm" label="身高 cm">
                <InputNumber min={50} max={250} step={0.1} precision={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12} lg={6}>
              <Form.Item name="weightKg" label="体重 kg">
                <InputNumber min={20} max={300} step={0.1} precision={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <div className="settings-bmi-display">
            <span>BMI</span>
            <strong>{bmi ? bmi.value.toFixed(1) : '-'}</strong>
            <Typography.Text type="secondary">{bmi ? bmi.label : '填写身高和体重后自动计算'}</Typography.Text>
          </div>
        </div>

        <Space wrap className="settings-actions">
          <Button type="primary" htmlType="submit" loading={saveProfile.isPending}>
            保存资料
          </Button>
          <Button danger onClick={logout}>
            退出登录
          </Button>
          <Popconfirm
            title="删除账号"
            description="此操作不可撤销，将永久删除你的所有健康记录、对话和配置。"
            okText="确认删除"
            cancelText="取消"
            okButtonProps={{ danger: true, loading: removeAccount.isPending }}
            onConfirm={() => removeAccount.mutate()}
          >
            <Button danger type="text">
              删除账号
            </Button>
          </Popconfirm>
        </Space>
      </Form>

      <div className="settings-section-divider">
        <div className="settings-section-title">安全</div>
        <Form form={passwordForm} layout="vertical" onFinish={(values) => password.mutate(values)}>
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item name="currentPassword" label="当前密码" rules={[{ required: true, message: '请输入当前密码' }]}>
                <Input.Password autoComplete="current-password" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="newPassword" label="新密码" rules={[{ required: true, min: 8, message: '新密码至少 8 位' }]}>
                <Input.Password autoComplete="new-password" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item
                name="confirmPassword"
                label="确认新密码"
                dependencies={['newPassword']}
                rules={[
                  { required: true, message: '请再次输入新密码' },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value || getFieldValue('newPassword') === value) return Promise.resolve();
                      return Promise.reject(new Error('两次输入的新密码不一致'));
                    },
                  }),
                ]}
              >
                <Input.Password autoComplete="new-password" />
              </Form.Item>
            </Col>
          </Row>
          <Button htmlType="submit" loading={password.isPending}>
            修改密码
          </Button>
        </Form>
      </div>
    </div>
  );

  function handleAvatarFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      message.warning('请选择图片文件');
      return;
    }
    avatar.mutate(file);
  }
}

function profileInitialValues(user: UserProfile): ProfileFormValues {
  return {
    displayName: user.displayName ?? undefined,
    bio: user.bio ?? undefined,
    email: user.email,
    birthYear: user.birthYear ?? undefined,
    gender: user.gender ?? undefined,
    heightCm: user.heightCm ?? undefined,
    weightKg: user.weightKg ?? undefined,
  };
}

function hydrateProfileForm(form: FormInstance<ProfileFormValues>, user: UserProfile) {
  form.setFieldsValue(profileInitialValues(user));
}

function getAvatarInitial(user: UserProfile) {
  return (user.displayName || user.email || 'H').trim().slice(0, 1).toUpperCase();
}

function calculateBmi(heightCm?: number, weightKg?: number) {
  if (!heightCm || !weightKg) return null;
  const meters = heightCm / 100;
  const value = weightKg / (meters * meters);
  if (!Number.isFinite(value) || value <= 0) return null;

  if (value < 18.5) return { value, label: '偏瘦' };
  if (value < 24) return { value, label: '正常' };
  if (value < 28) return { value, label: '偏胖' };
  return { value, label: '肥胖' };
}
