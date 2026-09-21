import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  async sendVerificationEmail(email: string, token: string): Promise<void> {
    this.logger.log(`[Email Verification] Enviando token de verificação para ${email}: ${token}`);
    // Future implementation (e.g. Nodemailer, AWS SES, SendGrid) will be placed here.
  }

  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    this.logger.log(`[Password Reset] Enviando token de redefinição de senha para ${email}: ${token}`);
    // Future implementation will be placed here.
  }
}
