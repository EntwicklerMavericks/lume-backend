import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import * as nodemailer from 'nodemailer';

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private smtpTransporter: nodemailer.Transporter | null = null;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    this.initSmtpTransporter();
  }

  /**
   * Inicializa o transporte SMTP caso credenciais estejam presentes no .env
   */
  private initSmtpTransporter() {
    const host = this.configService.get<string>('SMTP_HOST');
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');
    const port = Number(this.configService.get<string>('SMTP_PORT')) || 587;
    const secure = this.configService.get<string>('SMTP_SECURE') === 'true' || port === 465;

    if (host && user && pass) {
      try {
        this.smtpTransporter = nodemailer.createTransport({
          host,
          port,
          secure,
          auth: { user, pass },
        });
        this.logger.log(`[MailService] Transporte SMTP configurado para o host: ${host}`);
      } catch (err) {
        this.logger.error('[MailService] Falha ao configurar transporte SMTP:', err);
      }
    }
  }

  /**
   * Obtém as configurações institucionais da loja para branding nos e-mails
   */
  private async getStoreInfo() {
    try {
      const settings = await this.prisma.storeSettings.findUnique({
        where: { id: 'default' },
      });
      const name = settings?.storeName?.trim() && settings.storeName !== 'Lume Store'
        ? settings.storeName.trim()
        : (this.configService.get<string>('STORE_NAME') || 'Oliveira');

      const email = settings?.email?.trim() || this.configService.get<string>('STORE_EMAIL') || 'contato@oliveiramoda.com.br';

      return {
        name,
        email,
        phone: settings?.phone || '',
      };
    } catch (_) {
      return {
        name: this.configService.get<string>('STORE_NAME') || 'Oliveira',
        email: 'contato@oliveiramoda.com.br',
        phone: '',
      };
    }
  }

  /**
   * Envia um e-mail transacional via Resend, SMTP ou Fallback de Log
   */
  async sendMail(options: SendMailOptions): Promise<boolean> {
    const resendApiKey = this.configService.get<string>('RESEND_API_KEY');
    const store = await this.getStoreInfo();
    const defaultFrom = `${store.name} <${this.configService.get<string>('RESEND_FROM_EMAIL') || 'pedidos@lumestore.com.br'}>`;

    // 1. Prioridade 1: API do Resend (Moderna, alta entregabilidade)
    if (resendApiKey && resendApiKey.startsWith('re_')) {
      try {
        const fromEmail = this.configService.get<string>('RESEND_FROM_EMAIL') || 'onboarding@resend.dev';
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: `${store.name} <${fromEmail}>`,
            to: [options.to],
            subject: options.subject,
            html: options.html,
            text: options.text,
          }),
        });

        if (res.ok) {
          const data: any = await res.json();
          this.logger.log(`[MailService:Resend] E-mail enviado com sucesso para ${options.to} (ID: ${data.id})`);
          return true;
        } else {
          const errData: any = await res.json().catch(() => ({}));
          this.logger.error(`[MailService:Resend] Falha na API do Resend (${res.status}): ${errData?.message || JSON.stringify(errData)}`);
          return false;
        }
      } catch (err) {
        this.logger.error('[MailService:Resend] Erro ao disparar via Resend:', err);
      }
    }

    // 2. Prioridade 2: SMTP Clássico (Hostinger, Titan, Locaweb, cPanel, Gmail)
    if (this.smtpTransporter) {
      try {
        const fromEmail = this.configService.get<string>('SMTP_FROM_EMAIL') || this.configService.get<string>('SMTP_USER') || defaultFrom;
        const info = await this.smtpTransporter.sendMail({
          from: `${store.name} <${fromEmail}>`,
          to: options.to,
          subject: options.subject,
          html: options.html,
          text: options.text,
        });
        this.logger.log(`[MailService:SMTP] E-mail enviado com sucesso para ${options.to} (MsgId: ${info.messageId})`);
        return true;
      } catch (err) {
        this.logger.error('[MailService:SMTP] Falha ao enviar via SMTP:', err);
      }
    }

    // 3. Fallback: Modo Simulação / Log (Sem credenciais configuradas)
    this.logger.log(`[MailService:Simulador] E-mail não enviado fisicamente (sem RESEND_API_KEY ou SMTP configurado).`);
    this.logger.log(`[MailService:Simulador] Destinatário: ${options.to}`);
    this.logger.log(`[MailService:Simulador] Assunto: ${options.subject}`);
    return true;
  }

  // ==========================================
  // DISPAROS TRANSACIONAIS DO E-COMMERCE
  // ==========================================

  /**
   * E-mail 1: Pedido Recebido / Aguardando Pagamento (com PIX Copia e Cola se for PIX)
   */
  async sendOrderCreated(order: any): Promise<boolean> {
    if (!order || !order.customerEmail) return false;

    const store = await this.getStoreInfo();
    const isPix = order.paymentMethod === 'PIX';
    const formattedTotal = Number(order.total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const formattedShipping = Number(order.shippingCost).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const formattedSubtotal = Number(order.subtotal).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const itemsHtml = (order.items || []).map((item: any) => `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #1E293B; color: #F8FAFC;">
          <strong>${item.name}</strong>
          ${item.size ? `<br><span style="font-size: 12px; color: #94A3B8;">Tamanho: ${item.size}</span>` : ''}
          ${item.color ? `<span style="font-size: 12px; color: #94A3B8;"> | Cor: ${item.color}</span>` : ''}
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #1E293B; color: #94A3B8; text-align: center;">
          ${item.quantity}x
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #1E293B; color: #CCA45E; font-weight: bold; text-align: right;">
          ${Number(item.price * item.quantity).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
        </td>
      </tr>
    `).join('');

    const pixBlock = isPix && order.pixCopiaECola ? `
      <div style="background-color: #0F172A; border: 1px solid #CCA45E; border-radius: 8px; padding: 20px; margin: 25px 0; text-align: center;">
        <h3 style="color: #CCA45E; margin-top: 0; font-size: 18px;">Pagamento via PIX</h3>
        <p style="color: #CBD5E1; font-size: 14px; margin-bottom: 15px;">
          Copie o código abaixo e cole no aplicativo do seu banco para efetuar o pagamento instantâneo:
        </p>
        <div style="background-color: #020617; border: 1px dashed #334155; padding: 12px; border-radius: 6px; word-break: break-all; font-family: monospace; font-size: 13px; color: #38BDF8; margin-bottom: 15px;">
          ${order.pixCopiaECola}
        </div>
        <p style="color: #94A3B8; font-size: 12px; margin: 0;">
          Assim que o pagamento for realizado, seu pedido será confirmado automaticamente em poucos segundos!
        </p>
      </div>
    ` : '';

    const html = this.buildBaseEmailLayout({
      storeName: store.name,
      title: `Pedido Recebido! #${order.orderNumber}`,
      subtitle: `Olá, ${order.customerName.split(' ')[0]}! Recebemos o seu pedido com sucesso.`,
      content: `
        ${pixBlock}

        <h3 style="color: #F8FAFC; border-bottom: 1px solid #334155; padding-bottom: 8px; margin-top: 30px; font-size: 16px;">
          Resumo do Pedido #${order.orderNumber}
        </h3>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div style="background-color: #0F172A; border-radius: 8px; padding: 16px; margin-bottom: 25px;">
          <table style="width: 100%; font-size: 14px; color: #CBD5E1;">
            <tr>
              <td style="padding: 4px 0;">Subtotal:</td>
              <td style="padding: 4px 0; text-align: right; color: #F8FAFC;">${formattedSubtotal}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0;">Frete (${order.shippingMethod || 'Envio'}):</td>
              <td style="padding: 4px 0; text-align: right; color: #F8FAFC;">${Number(order.shippingCost) === 0 ? '<strong style="color: #4ADE80;">Grátis</strong>' : formattedShipping}</td>
            </tr>
            <tr style="border-top: 1px solid #334155; font-size: 16px;">
              <td style="padding: 10px 0 0 0; font-weight: bold; color: #F8FAFC;">Total:</td>
              <td style="padding: 10px 0 0 0; text-align: right; font-weight: bold; color: #CCA45E;">${formattedTotal}</td>
            </tr>
          </table>
        </div>

        <h3 style="color: #F8FAFC; border-bottom: 1px solid #334155; padding-bottom: 8px; font-size: 16px;">
          Endereço de Entrega
        </h3>
        <p style="color: #94A3B8; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">
          ${order.street}, ${order.number} ${order.complement ? `- ${order.complement}` : ''}<br>
          ${order.neighborhood} — ${order.city}/${order.state}<br>
          CEP: ${order.postalCode}
        </p>
      `,
    });

    return this.sendMail({
      to: order.customerEmail,
      subject: `Pedido #${order.orderNumber} recebido com sucesso! | ${store.name}`,
      html,
    });
  }

  /**
   * E-mail 2: Pagamento Aprovado / Confirmado
   */
  async sendPaymentConfirmed(order: any): Promise<boolean> {
    if (!order || !order.customerEmail) return false;

    const store = await this.getStoreInfo();
    const formattedTotal = Number(order.total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const html = this.buildBaseEmailLayout({
      storeName: store.name,
      title: `Pagamento Aprovado! 🎉`,
      subtitle: `Olá, ${order.customerName.split(' ')[0]}! Seu pagamento no valor de ${formattedTotal} foi confirmado.`,
      content: `
        <div style="background-color: #0F172A; border-left: 4px solid #4ADE80; border-radius: 6px; padding: 18px; margin: 20px 0;">
          <p style="color: #F8FAFC; margin: 0 0 6px 0; font-weight: bold; font-size: 15px;">
            Seu pedido #${order.orderNumber} entrou em preparação!
          </p>
          <p style="color: #CBD5E1; margin: 0; font-size: 14px; line-height: 1.5;">
            Nossa equipe já está separando e embalando seus produtos com todo cuidado. Assim que for despachado, você receberá um novo e-mail com o código de rastreamento para acompanhar a entrega.
          </p>
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <p style="color: #94A3B8; font-size: 13px; margin: 0;">
            Método de Pagamento: <strong style="color: #CCA45E;">${order.paymentMethod === 'PIX' ? 'PIX Instantâneo' : 'Cartão de Crédito'}</strong>
          </p>
        </div>
      `,
    });

    return this.sendMail({
      to: order.customerEmail,
      subject: `Pagamento aprovado para o pedido #${order.orderNumber}! | ${store.name}`,
      html,
    });
  }

  /**
   * E-mail 3: Pedido Despachado com Código de Rastreamento dos Correios
   */
  async sendOrderShipped(order: any): Promise<boolean> {
    if (!order || !order.customerEmail) return false;

    const store = await this.getStoreInfo();
    const trackingCode = order.trackingCode || '';
    const trackingUrl = trackingCode
      ? `https://rastreamento.correios.com.br/app/index.php?codigo=${trackingCode}`
      : null;

    const html = this.buildBaseEmailLayout({
      storeName: store.name,
      title: `Seu pedido está a caminho! 📦`,
      subtitle: `Olá, ${order.customerName.split(' ')[0]}! Seu pedido #${order.orderNumber} acabou de ser postado.`,
      content: `
        <div style="background-color: #0F172A; border: 1px solid #334155; border-radius: 8px; padding: 25px; margin: 25px 0; text-align: center;">
          <p style="color: #CBD5E1; font-size: 14px; margin: 0 0 10px 0;">
            Transportadora / Envio: <strong style="color: #F8FAFC;">${order.shippingMethod || 'Correios'}</strong>
          </p>
          
          ${trackingCode ? `
            <p style="color: #94A3B8; font-size: 13px; margin: 0 0 6px 0;">Código de Rastreamento:</p>
            <div style="font-size: 20px; font-weight: bold; color: #CCA45E; letter-spacing: 2px; margin-bottom: 20px; font-family: monospace;">
              ${trackingCode}
            </div>
            
            <a href="${trackingUrl}" target="_blank" style="display: inline-block; background-color: #CCA45E; color: #0A152E; font-weight: bold; font-size: 14px; padding: 12px 24px; border-radius: 6px; text-decoration: none; text-transform: uppercase; letter-spacing: 1px;">
              Rastrear Minha Encomenda
            </a>
          ` : `
            <p style="color: #94A3B8; font-size: 13px; margin: 0;">
              Sua encomenda foi enviada e chegará no endereço cadastrado dentro do prazo previsto.
            </p>
          `}
        </div>

        <h3 style="color: #F8FAFC; border-bottom: 1px solid #334155; padding-bottom: 8px; font-size: 16px;">
          Endereço de Destino
        </h3>
        <p style="color: #94A3B8; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">
          ${order.street}, ${order.number} ${order.complement ? `- ${order.complement}` : ''}<br>
          ${order.neighborhood} — ${order.city}/${order.state}<br>
          CEP: ${order.postalCode}
        </p>
      `,
    });

    return this.sendMail({
      to: order.customerEmail,
      subject: `Seu pedido #${order.orderNumber} foi despachado! 📦 | ${store.name}`,
      html,
    });
  }

  /**
   * E-mail 4: Pedido Entregue com Sucesso! 🛍️✨
   */
  async sendOrderDelivered(order: any): Promise<boolean> {
    if (!order || !order.customerEmail) return false;

    const store = await this.getStoreInfo();

    const itemsHtml = (order.items || []).map((item: any) => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #1E293B; color: #F8FAFC; font-size: 14px;">
          <strong>${item.name}</strong>
          ${item.size ? `<br><span style="font-size: 12px; color: #94A3B8;">Tamanho: ${item.size}</span>` : ''}
          ${item.color ? `<span style="font-size: 12px; color: #94A3B8;"> | Cor: ${item.color}</span>` : ''}
        </td>
        <td style="padding: 10px; border-bottom: 1px solid #1E293B; color: #94A3B8; text-align: center; font-size: 14px;">
          ${item.quantity}x
        </td>
      </tr>
    `).join('');

    const html = this.buildBaseEmailLayout({
      storeName: store.name,
      title: `Pedido Entregue! 🛍️✨`,
      subtitle: `Olá, ${order.customerName.split(' ')[0]}! O seu pedido #${order.orderNumber} foi entregue com sucesso.`,
      content: `
        <div style="background-color: #0F172A; border-left: 4px solid #4ADE80; border-radius: 6px; padding: 20px; margin: 20px 0;">
          <p style="color: #4ADE80; margin: 0 0 6px 0; font-weight: bold; font-size: 16px;">
            🎉 Encomenda entregue no seu endereço!
          </p>
          <p style="color: #CBD5E1; margin: 0; font-size: 14px; line-height: 1.6;">
            Esperamos que você ame as suas novas peças! Cada produto foi embalado com muito carinho para oferecer a você a melhor experiência em estilo, conforto e performance.
          </p>
        </div>

        ${itemsHtml ? `
          <h3 style="color: #F8FAFC; border-bottom: 1px solid #334155; padding-bottom: 8px; font-size: 15px; margin-top: 25px;">
            Itens Entregues
          </h3>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>
        ` : ''}

        <div style="background-color: #0F172A; border-radius: 8px; padding: 18px; margin-bottom: 25px;">
          <p style="color: #F8FAFC; margin: 0 0 8px 0; font-weight: bold; font-size: 14px;">
            Endereço de Entrega:
          </p>
          <p style="color: #94A3B8; font-size: 13px; line-height: 1.5; margin: 0;">
            ${order.street}, ${order.number} ${order.complement ? `- ${order.complement}` : ''}<br>
            ${order.neighborhood} — ${order.city}/${order.state}<br>
            CEP: ${order.postalCode}
          </p>
        </div>

        <div style="text-align: center; border-top: 1px solid #1E293B; padding-top: 20px;">
          <p style="color: #CBD5E1; font-size: 14px; margin: 0 0 8px 0;">
            Precisa de alguma troca ou suporte?
          </p>
          <p style="color: #94A3B8; font-size: 13px; margin: 0;">
            Nossa equipe de atendimento da <strong style="color: #CCA45E;">${store.name}</strong> está à sua disposição. Basta responder a este e-mail ou chamar no WhatsApp oficial!
          </p>
        </div>
      `,
    });

    return this.sendMail({
      to: order.customerEmail,
      subject: `Seu pedido #${order.orderNumber} foi entregue com sucesso! 🛍️ | ${store.name}`,
      html,
    });
  }

  /**
   * E-mail 5: Código de Verificação para Redefinição de Senha (Segurança)
   */
  async sendPasswordResetCode(email: string, code: string, customerName?: string): Promise<boolean> {
    if (!email) return false;

    const store = await this.getStoreInfo();
    const firstName = customerName ? customerName.split(' ')[0] : 'Cliente';

    const html = this.buildBaseEmailLayout({
      storeName: store.name,
      title: 'Código de Recuperação de Senha',
      subtitle: `Olá, ${firstName}! Recebemos uma solicitação para redefinir a senha da sua conta.`,
      content: `
        <div style="background-color: #0F172A; border: 2px dashed #CCA45E; border-radius: 12px; padding: 26px 20px; text-align: center; margin: 25px 0;">
          <p style="color: #94A3B8; font-size: 13px; text-transform: uppercase; letter-spacing: 1.5px; margin: 0 0 10px 0; font-weight: 600;">
            Seu Código de Verificação
          </p>
          <div style="font-size: 38px; font-weight: 800; letter-spacing: 8px; color: #CCA45E; margin: 8px 0 12px 0; font-family: 'Courier New', Courier, monospace;">
            ${code}
          </div>
          <div style="display: inline-block; background-color: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 20px; padding: 4px 14px;">
            <span style="color: #F87171; font-size: 12px; font-weight: 600;">⏰ Válido por 15 minutos</span>
          </div>
        </div>

        <div style="background-color: #020617; border-left: 4px solid #38BDF8; border-radius: 6px; padding: 16px; margin: 20px 0;">
          <p style="color: #F8FAFC; margin: 0 0 6px 0; font-weight: bold; font-size: 14px;">
            Dica de Segurança
          </p>
          <p style="color: #94A3B8; margin: 0; font-size: 13px; line-height: 1.5;">
            Nunca compartilhe este código com terceiros. A equipe da ${store.name} nunca entrará em contato solicitando este código de segurança.
          </p>
        </div>

        <p style="color: #64748B; font-size: 12px; line-height: 1.5; margin: 20px 0 0 0; text-align: center;">
          Se você não solicitou a redefinição de senha, ignore este e-mail. Sua conta e senha permanecem totalmente seguras.
        </p>
      `,
    });

    return this.sendMail({
      to: email,
      subject: `Seu código de segurança: ${code} | ${store.name}`,
      html,
    });
  }

  // ==========================================
  // TEMPLATE HTML BASE RESPONSIVO E ELEGANTE
  // ==========================================

  private buildBaseEmailLayout(params: { storeName: string; title: string; subtitle: string; content: string }): string {
    return `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${params.title}</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #070D1E; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #070D1E; padding: 30px 15px;">
          <tr>
            <td align="center">
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #0A152E; border: 1px solid #1E293B; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);">
                
                <!-- HEADER DA LOJA -->
                <tr>
                  <td align="center" style="padding: 30px 20px 20px 20px; border-bottom: 1px solid #1E293B; background: linear-gradient(180deg, #0F172A 0%, #0A152E 100%);">
                    <h1 style="margin: 0; color: #CCA45E; font-size: 24px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase;">
                      ${params.storeName}
                    </h1>
                    <p style="margin: 5px 0 0 0; color: #64748B; font-size: 11px; letter-spacing: 2px; text-transform: uppercase;">
                      MODA ESPORTIVA E CASUAL
                    </p>
                  </td>
                </tr>

                <!-- TITULO DO E-MAIL -->
                <tr>
                  <td style="padding: 30px 30px 10px 30px; text-align: center;">
                    <h2 style="margin: 0 0 8px 0; color: #F8FAFC; font-size: 22px; font-weight: bold;">
                      ${params.title}
                    </h2>
                    <p style="margin: 0; color: #94A3B8; font-size: 15px; line-height: 1.5;">
                      ${params.subtitle}
                    </p>
                  </td>
                </tr>

                <!-- CONTEÚDO PRINCIPAL -->
                <tr>
                  <td style="padding: 20px 30px 30px 30px;">
                    ${params.content}
                  </td>
                </tr>

                <!-- FOOTER -->
                <tr>
                  <td style="padding: 20px 30px; background-color: #060C1B; border-top: 1px solid #1E293B; text-align: center;">
                    <p style="margin: 0 0 8px 0; color: #64748B; font-size: 12px;">
                      Dúvidas sobre o seu pedido? Responda a este e-mail ou entre em contato com nosso atendimento.
                    </p>
                    <p style="margin: 0; color: #475569; font-size: 11px;">
                      © ${new Date().getFullYear()} ${params.storeName}. Todos os direitos reservados.
                    </p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
  }
}
