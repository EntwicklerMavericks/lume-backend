import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface AsaasCustomerInput {
  name: string;
  email: string;
  cpfCnpj: string;
  phone: string;
  postalCode?: string;
  address?: string;
  addressNumber?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
}

export interface AsaasPixResult {
  paymentId: string;
  customerId: string;
  status: 'PENDING' | 'CONFIRMED' | 'RECEIVED';
  qrCodeImage: string;
  copiaECola: string;
  expiresAt: Date;
  netValue?: number;
}

export interface AsaasCreditCardResult {
  paymentId: string;
  customerId: string;
  status: 'PENDING' | 'CONFIRMED' | 'RECEIVED' | 'REFUNDED' | 'CANCELLED';
  confirmed: boolean;
  installments: number;
  netValue?: number;
  message?: string;
}

@Injectable()
export class AsaasService {
  private readonly logger = new Logger(AsaasService.name);
  private readonly apiKey: string;
  private readonly environment: string;
  private readonly baseUrl: string;
  private readonly isLive: boolean;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('ASAAS_API_KEY', '').trim();
    this.environment = this.configService.get<string>('ASAAS_ENVIRONMENT', 'sandbox');
    this.baseUrl =
      this.environment === 'production'
        ? 'https://api.asaas.com/v3'
        : 'https://api-sandbox.asaas.com/v3';

    // Se chave válida estiver configurada (iniciando com $aact_ ou tamanho suficiente)
    this.isLive =
      Boolean(this.apiKey) &&
      this.apiKey.length > 20 &&
      !this.apiKey.includes('sua_chave') &&
      !this.apiKey.startsWith('$aact_sua_chave');

    if (this.isLive) {
      this.logger.log(`[Asaas] Inicializado com sucesso em modo REAL (${this.environment}). URL: ${this.baseUrl}`);
    } else {
      this.logger.warn(
        `[Asaas] Chave de API não informada ou de exemplo. Ativando simulador Sandbox Asaas para desenvolvimento local.`,
      );
    }
  }

  private getHeaders(): Record<string, string> {
    return {
      'User-Agent': 'Lume-Store/1.0',
      'Content-Type': 'application/json',
      access_token: this.apiKey,
    };
  }

  getIsLive(): boolean {
    return this.isLive;
  }

  /**
   * Localiza ou cria um cliente no Asaas
   */
  async findOrCreateCustomer(input: AsaasCustomerInput): Promise<string> {
    const cleanCpf = input.cpfCnpj.replace(/\D/g, '');
    const cleanPhone = input.phone.replace(/\D/g, '');

    if (!this.isLive) {
      return `cus_mock_${cleanCpf || 'guest'}`;
    }

    try {
      // 1. Tentar localizar cliente por CPF/CNPJ
      const searchRes = await fetch(`${this.baseUrl}/customers?cpfCnpj=${cleanCpf}`, {
        headers: this.getHeaders(),
      });

      if (searchRes.ok) {
        const searchData = await searchRes.json();
        if (searchData.data && searchData.data.length > 0) {
          const existing = searchData.data[0];
          this.logger.log(`[Asaas] Cliente existente encontrado: ${existing.id} (${existing.name})`);
          return existing.id;
        }
      }

      // 2. Se não encontrou, criar novo cliente
      const createRes = await fetch(`${this.baseUrl}/customers`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          name: input.name,
          email: input.email,
          cpfCnpj: cleanCpf,
          phone: cleanPhone,
          mobilePhone: cleanPhone,
          postalCode: input.postalCode ? input.postalCode.replace(/\D/g, '') : undefined,
          address: input.address,
          addressNumber: input.addressNumber,
          complement: input.complement,
          province: input.neighborhood,
          externalReference: cleanCpf,
          notificationDisabled: false,
        }),
      });

      const createData = await createRes.json();
      if (!createRes.ok) {
        this.logger.error(`[Asaas] Erro ao criar cliente: ${JSON.stringify(createData)}`);
        throw new Error(createData.errors?.[0]?.description || 'Erro ao cadastrar cliente no Asaas');
      }

      this.logger.log(`[Asaas] Novo cliente criado: ${createData.id} (${input.name})`);
      return createData.id;
    } catch (err: any) {
      this.logger.error(`[Asaas] Falha na comunicação com Asaas: ${err.message}`);
      throw err;
    }
  }

  /**
   * Gera cobrança via PIX
   */
  async createPixPayment(params: {
    orderId: string;
    orderNumber: string;
    total: number;
    customerId: string;
    customerNotes?: string;
  }): Promise<AsaasPixResult> {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 1); // 24h para pagar
    const dueDateStr = dueDate.toISOString().split('T')[0];

    if (!this.isLive) {
      // Modo Simulador Inteligente: gera QR Code em SVG/DataURL e Copia-e-Cola formatado
      const paymentId = `pay_pix_${Date.now()}`;
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const copiaECola = this.generateMockPixCopiaECola(params.orderNumber, params.total);
      const qrCodeImage = this.generateMockPixSvg(params.orderNumber, params.total);

      return {
        paymentId,
        customerId: params.customerId,
        status: 'PENDING',
        qrCodeImage,
        copiaECola,
        expiresAt,
        netValue: params.total,
      };
    }

    try {
      // 1. Criar cobrança no Asaas
      const paymentRes = await fetch(`${this.baseUrl}/payments`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          customer: params.customerId,
          billingType: 'PIX',
          value: params.total,
          dueDate: dueDateStr,
          description: `Pedido #${params.orderNumber} - Lume`,
          externalReference: params.orderId,
          postalService: false,
        }),
      });

      const paymentData = await paymentRes.json();
      if (!paymentRes.ok) {
        this.logger.error(`[Asaas] Erro ao gerar PIX: ${JSON.stringify(paymentData)}`);
        throw new Error(paymentData.errors?.[0]?.description || 'Erro ao gerar pagamento PIX');
      }

      const paymentId = paymentData.id;

      // 2. Buscar o QR Code dinâmico do Asaas (com retry de até 4 tentativas caso esteja registrando)
      let qrData: any = null;
      for (let attempt = 1; attempt <= 4; attempt++) {
        try {
          const qrRes = await fetch(`${this.baseUrl}/payments/${paymentId}/pixQrCode`, {
            headers: this.getHeaders(),
          });
          if (qrRes.ok) {
            qrData = await qrRes.json();
            if (qrData.encodedImage && qrData.payload) break;
          }
        } catch (_) {}
        await new Promise((r) => setTimeout(r, 800));
      }

      if (!qrData || !qrData.encodedImage) {
        this.logger.error(`[Asaas] Erro ao buscar QR Code PIX após tentativas: ${JSON.stringify(qrData)}`);
        throw new Error('Erro ao obter QR Code do Asaas. Tente novamente em instantes.');
      }

      return {
        paymentId,
        customerId: params.customerId,
        status: 'PENDING',
        qrCodeImage: `data:image/png;base64,${qrData.encodedImage}`,
        copiaECola: qrData.payload,
        expiresAt: qrData.expirationDate ? new Date(qrData.expirationDate) : dueDate,
        netValue: paymentData.netValue,
      };
    } catch (err: any) {
      this.logger.error(`[Asaas] Falha ao processar PIX: ${err.message}`);
      throw err;
    }
  }

  /**
   * Processa pagamento transparente via Cartão de Crédito
   */
  async createCreditCardPayment(params: {
    orderId: string;
    orderNumber: string;
    total: number;
    customerId: string;
    installments: number;
    card: {
      holderName: string;
      number: string;
      expiryMonth: string;
      expiryYear: string;
      cvv: string;
    };
    cardHolder: {
      name: string;
      email: string;
      cpfCnpj: string;
      postalCode: string;
      addressNumber: string;
      addressComplement?: string;
      phone: string;
    };
    remoteIp?: string;
  }): Promise<AsaasCreditCardResult> {
    const dueDate = new Date().toISOString().split('T')[0];
    const cleanCardNumber = params.card.number.replace(/\D/g, '');
    const cleanCpf = params.cardHolder.cpfCnpj.replace(/\D/g, '');
    const cleanPhone = params.cardHolder.phone.replace(/\D/g, '');
    const cleanCep = params.cardHolder.postalCode.replace(/\D/g, '');

    const monthFormatted = params.card.expiryMonth.padStart(2, '0');
    const yearFormatted =
      params.card.expiryYear.length === 2
        ? `20${params.card.expiryYear}`
        : params.card.expiryYear;

    if (!this.isLive) {
      // Simulação para testes locais imediatos
      const paymentId = `pay_card_${Date.now()}`;
      
      // Simula recusa se final do cartão for 0000
      if (cleanCardNumber.endsWith('0000')) {
        return {
          paymentId,
          customerId: params.customerId,
          status: 'REFUNDED',
          confirmed: false,
          installments: params.installments || 1,
          message: 'Transação não autorizada pela operadora do cartão (Simulação de teste).',
        };
      }

      return {
        paymentId,
        customerId: params.customerId,
        status: 'CONFIRMED',
        confirmed: true,
        installments: params.installments || 1,
        netValue: params.total * 0.97,
        message: 'Pagamento aprovado com sucesso!',
      };
    }

    try {
      const payload: any = {
        customer: params.customerId,
        billingType: 'CREDIT_CARD',
        value: params.total,
        dueDate,
        description: `Pedido #${params.orderNumber} - Lume`,
        externalReference: params.orderId,
        creditCard: {
          holderName: params.card.holderName.toUpperCase().trim(),
          number: cleanCardNumber,
          expiryMonth: monthFormatted,
          expiryYear: yearFormatted,
          ccv: params.card.cvv.trim(),
        },
        creditCardHolderInfo: {
          name: params.cardHolder.name,
          email: params.cardHolder.email,
          cpfCnpj: cleanCpf,
          postalCode: cleanCep,
          addressNumber: params.cardHolder.addressNumber,
          addressComplement: params.cardHolder.addressComplement || null,
          phone: cleanPhone,
          mobilePhone: cleanPhone,
        },
        remoteIp: params.remoteIp || '127.0.0.1',
      };

      if (params.installments && params.installments > 1) {
        payload.installmentCount = params.installments;
        payload.installmentValue = Number((params.total / params.installments).toFixed(2));
      }

      const res = await fetch(`${this.baseUrl}/payments`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        this.logger.error(`[Asaas] Erro no cartão: ${JSON.stringify(data)}`);
        const msg = data.errors?.[0]?.description || 'Pagamento com cartão não aprovado';
        return {
          paymentId: data.id || 'error',
          customerId: params.customerId,
          status: 'REFUNDED',
          confirmed: false,
          installments: params.installments || 1,
          message: msg,
        };
      }

      const isConfirmed = data.status === 'CONFIRMED' || data.status === 'RECEIVED';

      return {
        paymentId: data.id,
        customerId: params.customerId,
        status: isConfirmed ? 'CONFIRMED' : 'PENDING',
        confirmed: isConfirmed,
        installments: params.installments || 1,
        netValue: data.netValue,
        message: isConfirmed ? 'Pagamento aprovado com sucesso!' : 'Pagamento em análise pelo gateway.',
      };
    } catch (err: any) {
      this.logger.error(`[Asaas] Exceção no cartão: ${err.message}`);
      throw err;
    }
  }

  /**
   * Consulta status de uma cobrança no Asaas
   */
  async getPaymentStatus(paymentId: string): Promise<string> {
    if (!this.isLive) {
      return 'CONFIRMED';
    }

    try {
      const res = await fetch(`${this.baseUrl}/payments/${paymentId}`, {
        headers: this.getHeaders(),
      });

      if (!res.ok) {
        return 'PENDING';
      }

      const data = await res.json();
      return data.status; // CONFIRMED, RECEIVED, PENDING, OVERDUE, etc.
    } catch (err) {
      return 'PENDING';
    }
  }

  // Helpers para o simulador Sandbox
  private generateMockPixCopiaECola(orderNumber: string, total: number): string {
    const formattedTotal = total.toFixed(2);
    return `00020101021226830014br.gov.bcb.pix2561pix.asaas.com/qr/stat/lume_${orderNumber}_${Date.now()}520400005303986540${formattedTotal.length}${formattedTotal}5802BR5910LUME STORE6009SAO PAULO62070503***6304${Math.floor(1000 + Math.random() * 9000)}`;
  }

  private generateMockPixSvg(orderNumber: string, total: number): string {
    // Retorna uma imagem SVG real codificada em Base64 simulando um QR Code PIX com logo central
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" width="300" height="300">
      <rect width="300" height="300" fill="#ffffff" rx="16"/>
      <!-- QR Pattern Mock -->
      <g fill="#09090b">
        <!-- Top Left Corner -->
        <rect x="24" y="24" width="60" height="60" rx="8" fill="#00b493"/>
        <rect x="36" y="36" width="36" height="36" fill="#ffffff" rx="4"/>
        <rect x="44" y="44" width="20" height="20" fill="#00b493" rx="2"/>
        
        <!-- Top Right Corner -->
        <rect x="216" y="24" width="60" height="60" rx="8" fill="#00b493"/>
        <rect x="228" y="36" width="36" height="36" fill="#ffffff" rx="4"/>
        <rect x="236" y="44" width="20" height="20" fill="#00b493" rx="2"/>
        
        <!-- Bottom Left Corner -->
        <rect x="24" y="216" width="60" height="60" rx="8" fill="#00b493"/>
        <rect x="36" y="228" width="36" height="36" fill="#ffffff" rx="4"/>
        <rect x="44" y="236" width="20" height="20" fill="#00b493" rx="2"/>
        
        <!-- Grid Dots Simulated -->
        <rect x="100" y="28" width="16" height="16" fill="#18181b"/>
        <rect x="124" y="28" width="16" height="16" fill="#18181b"/>
        <rect x="160" y="28" width="16" height="16" fill="#18181b"/>
        <rect x="184" y="28" width="16" height="16" fill="#18181b"/>
        
        <rect x="100" y="52" width="16" height="16" fill="#18181b"/>
        <rect x="136" y="52" width="16" height="16" fill="#18181b"/>
        <rect x="172" y="52" width="16" height="16" fill="#18181b"/>
        
        <rect x="28" y="100" width="16" height="16" fill="#18181b"/>
        <rect x="52" y="100" width="16" height="16" fill="#18181b"/>
        <rect x="84" y="100" width="16" height="16" fill="#18181b"/>
        <rect x="116" y="100" width="16" height="16" fill="#18181b"/>
        <rect x="180" y="100" width="16" height="16" fill="#18181b"/>
        <rect x="212" y="100" width="16" height="16" fill="#18181b"/>
        <rect x="244" y="100" width="16" height="16" fill="#18181b"/>

        <rect x="28" y="124" width="16" height="16" fill="#18181b"/>
        <rect x="68" y="124" width="16" height="16" fill="#18181b"/>
        <rect x="204" y="124" width="16" height="16" fill="#18181b"/>
        <rect x="252" y="124" width="16" height="16" fill="#18181b"/>

        <rect x="28" y="148" width="16" height="16" fill="#18181b"/>
        <rect x="76" y="148" width="16" height="16" fill="#18181b"/>
        <rect x="220" y="148" width="16" height="16" fill="#18181b"/>
        <rect x="244" y="148" width="16" height="16" fill="#18181b"/>

        <rect x="28" y="172" width="16" height="16" fill="#18181b"/>
        <rect x="52" y="172" width="16" height="16" fill="#18181b"/>
        <rect x="100" y="172" width="16" height="16" fill="#18181b"/>
        <rect x="180" y="172" width="16" height="16" fill="#18181b"/>
        <rect x="228" y="172" width="16" height="16" fill="#18181b"/>
        <rect x="252" y="172" width="16" height="16" fill="#18181b"/>

        <rect x="100" y="216" width="16" height="16" fill="#18181b"/>
        <rect x="140" y="216" width="16" height="16" fill="#18181b"/>
        <rect x="176" y="216" width="16" height="16" fill="#18181b"/>
        <rect x="220" y="216" width="16" height="16" fill="#18181b"/>
        <rect x="252" y="216" width="16" height="16" fill="#18181b"/>

        <rect x="108" y="244" width="16" height="16" fill="#18181b"/>
        <rect x="148" y="244" width="16" height="16" fill="#18181b"/>
        <rect x="188" y="244" width="16" height="16" fill="#18181b"/>
        <rect x="236" y="244" width="16" height="16" fill="#18181b"/>
      </g>
      <!-- Center PIX Emblem -->
      <rect x="115" y="115" width="70" height="70" rx="14" fill="#ffffff" stroke="#00b493" stroke-width="4"/>
      <path d="M136 150 L146 140 L156 150 L146 160 Z" fill="#00b493"/>
      <path d="M146 132 L158 144 L164 138 L152 126 Z" fill="#00b493"/>
      <path d="M146 168 L158 156 L164 162 L152 174 Z" fill="#00b493"/>
      <path d="M134 144 L146 132 L140 126 L128 138 Z" fill="#00b493"/>
      <path d="M134 156 L146 168 L140 174 L128 162 Z" fill="#00b493"/>
    </svg>`;

    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }
}
