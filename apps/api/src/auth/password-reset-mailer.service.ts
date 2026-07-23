import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

@Injectable()
export class PasswordResetMailer {
  private readonly logger = new Logger(PasswordResetMailer.name);
  private readonly transporter?: Transporter;

  constructor(private readonly config: ConfigService) {
    const smtpUrl = this.config.get<string>('SMTP_URL');
    if (smtpUrl) {
      this.transporter = nodemailer.createTransport(smtpUrl, {
        connectionTimeout: this.config.get<number>('SMTP_CONNECTION_TIMEOUT_MS') ?? 10_000,
        greetingTimeout: this.config.get<number>('SMTP_GREETING_TIMEOUT_MS') ?? 10_000,
        socketTimeout: this.config.get<number>('SMTP_SOCKET_TIMEOUT_MS') ?? 20_000,
      });
    }
  }

  async send(email: string, resetUrl: string, resetToken: string) {
    if (!this.transporter) {
      if (this.config.get<string>('NODE_ENV') === 'production') {
        throw new Error('SMTP_URL is required to send password reset emails');
      }

      this.logger.warn(`SMTP_URL is not configured. Development password reset link for ${email}: ${resetUrl}`);
      return;
    }

    const localReset = isLocalResetUrl(resetUrl);
    const textLines = [
      '你申请了重置 HealthFlow 登录密码。',
      '',
      ...(localReset ? [] : ['请在 30 分钟内打开以下链接：', '', resetUrl, '']),
      localReset
        ? '当前是本地开发环境，请打开 HealthFlow 登录页，在“忘记密码”中选择“输入重置码”，然后粘贴以下重置码：'
        : '如果链接无法打开，请在 HealthFlow 登录页的“忘记密码”中选择“输入重置码”，然后粘贴以下重置码：',
      '',
      resetToken,
      '',
      '如果不是你本人操作，请忽略此邮件。',
    ];
    const htmlParts = [
      '<p>你申请了重置 HealthFlow 登录密码。</p>',
      ...(localReset ? [] : [`<p><a href="${escapeHtml(resetUrl)}">重置密码</a></p>`]),
      `<p>${
        localReset
          ? '当前是本地开发环境，请打开 HealthFlow 登录页，在“忘记密码”中选择“输入重置码”，然后粘贴以下重置码：'
          : '如果链接无法打开，请在 HealthFlow 登录页的“忘记密码”中选择“输入重置码”，然后粘贴以下重置码：'
      }</p>`,
      `<p><code style="display:inline-block;padding:10px 12px;background:#f3f4f6;border-radius:6px;word-break:break-all">${escapeHtml(resetToken)}</code></p>`,
      '<p>该重置码将在 30 分钟后失效，且只能使用一次。如果不是你本人操作，请忽略此邮件。</p>',
    ];

    const info = await this.transporter.sendMail({
      from: this.config.get<string>('SMTP_FROM') || 'HealthFlow <no-reply@healthflow.local>',
      to: email,
      subject: '重置你的 HealthFlow 密码',
      text: textLines.join('\n'),
      html: htmlParts.join(''),
    });
    this.logger.log(`Password reset email accepted by SMTP for ${email.split('@')[1] || 'unknown domain'} (${info.messageId})`);
  }
}

function isLocalResetUrl(value: string) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return false;
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => {
    const replacements: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    };
    return replacements[character];
  });
}
