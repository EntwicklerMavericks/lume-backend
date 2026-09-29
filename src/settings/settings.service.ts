import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { CalculateShippingDto } from './dto/calculate-shipping.dto';

export interface ShippingOption {
  id: string;
  name: string;
  carrier: string;
  service: string;
  deadline: string;
  price: number;
  originalPrice: number;
  isFree: boolean;
}

export interface ShippingResult {
  origin: {
    postalCode: string;
    street: string;
    city: string;
    state: string;
  };
  destination: {
    postalCode: string;
    city: string;
    state: string;
  };
  freeShippingQualified: boolean;
  freeShippingThreshold: number;
  options: ShippingOption[];
}

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Obtém as configurações da loja ou cria com os padrões caso ainda não existam.
   */
  async getSettings() {
    let settings = await this.prisma.storeSettings.findUnique({
      where: { id: 'default' },
    });

    if (!settings) {
      settings = await this.prisma.storeSettings.create({
        data: {
          id: 'default',
          storeName: 'Lume Store',
          email: 'contato@lumestore.com.br',
          phone: '(11) 99999-9999',
          postalCode: '',
          street: '',
          number: '',
          complement: '',
          neighborhood: '',
          city: '',
          state: '',
          pacBaseRate: 19.90,
          sedexBaseRate: 32.90,
          freeShippingMin: 299.00,
        },
      });
    }

    return settings;
  }

  /**
   * Atualiza as configurações da loja.
   */
  async updateSettings(dto: UpdateSettingsDto) {
    const data: any = {};

    if (dto.storeName !== undefined) data.storeName = dto.storeName;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.postalCode !== undefined) data.postalCode = dto.postalCode.replace(/\D/g, '');
    if (dto.street !== undefined) data.street = dto.street;
    if (dto.number !== undefined) data.number = dto.number;
    if (dto.complement !== undefined) data.complement = dto.complement;
    if (dto.neighborhood !== undefined) data.neighborhood = dto.neighborhood;
    if (dto.city !== undefined) data.city = dto.city;
    if (dto.state !== undefined) data.state = dto.state.toUpperCase();
    if (dto.pacBaseRate !== undefined) data.pacBaseRate = dto.pacBaseRate;
    if (dto.sedexBaseRate !== undefined) data.sedexBaseRate = dto.sedexBaseRate;
    if (dto.freeShippingMin !== undefined) data.freeShippingMin = dto.freeShippingMin;

    return this.prisma.storeSettings.upsert({
      where: { id: 'default' },
      update: data,
      create: {
        id: 'default',
        storeName: dto.storeName || 'Lume Store',
        email: dto.email || 'contato@lumestore.com.br',
        phone: dto.phone || '(11) 99999-9999',
        postalCode: (dto.postalCode || '01310-100').replace(/\D/g, ''),
        street: dto.street || 'Avenida Paulista',
        number: dto.number || '1000',
        complement: dto.complement || 'Andar 10',
        neighborhood: dto.neighborhood || 'Bela Vista',
        city: dto.city || 'São Paulo',
        state: (dto.state || 'SP').toUpperCase(),
        pacBaseRate: dto.pacBaseRate || 19.90,
        sedexBaseRate: dto.sedexBaseRate || 32.90,
        freeShippingMin: dto.freeShippingMin || 299.00,
      },
    });
  }

  /**
   * Calcula as opções de frete (PAC e SEDEX) com base no endereço de origem da loja e CEP destino.
   */
  async calculateShipping(dto: CalculateShippingDto): Promise<ShippingResult> {
    const rawDest = (dto.destinationCep || '').replace(/\D/g, '');
    if (rawDest.length !== 8) {
      throw new BadRequestException('CEP de destino inválido. Deve conter 8 dígitos numéricos.');
    }

    const settings = await this.getSettings();
    const originCep = (settings.postalCode || '01310-100').replace(/\D/g, '');
    const originState = (settings.state || 'SP').toUpperCase();

    // Determina o estado/região de destino com base nas faixas de CEP brasileiras
    const destInfo = this.resolveCepRegion(rawDest);

    // Ajusta o multiplicador de distância baseado na localização de destino
    const isSameState = destInfo.state === originState;
    const isLocalMetro = isSameState && (rawDest.startsWith('01') || rawDest.startsWith('02') || rawDest.startsWith('03') || rawDest.startsWith('04') || rawDest.startsWith('05'));

    const pacBase = Number(settings.pacBaseRate) || 19.90;
    const sedexBase = Number(settings.sedexBaseRate) || 32.90;
    const freeMin = Number(settings.freeShippingMin) || 299.00;
    const currentSubtotal = Number(dto.subtotal) || 0;
    const isFreeQualified = currentSubtotal >= freeMin;

    let pacPrice = pacBase;
    let sedexPrice = sedexBase;
    let pacDeadline = '4 a 6 dias úteis';
    let sedexDeadline = '2 a 3 dias úteis';

    if (isLocalMetro) {
      pacPrice = Math.round(pacBase * 0.85 * 100) / 100;
      sedexPrice = Math.round(sedexBase * 0.85 * 100) / 100;
      pacDeadline = '2 a 3 dias úteis';
      sedexDeadline = '1 a 2 dias úteis';
    } else if (isSameState) {
      pacPrice = pacBase;
      sedexPrice = sedexBase;
      pacDeadline = '3 a 5 dias úteis';
      sedexDeadline = '1 a 2 dias úteis';
    } else if (['RJ', 'MG', 'PR', 'SC', 'ES'].includes(destInfo.state)) {
      pacPrice = Math.round((pacBase + 5.0) * 100) / 100;
      sedexPrice = Math.round((sedexBase + 8.5) * 100) / 100;
      pacDeadline = '5 a 7 dias úteis';
      sedexDeadline = '2 a 3 dias úteis';
    } else if (['RS', 'DF', 'GO', 'MS', 'MT', 'BA'].includes(destInfo.state)) {
      pacPrice = Math.round((pacBase + 9.5) * 100) / 100;
      sedexPrice = Math.round((sedexBase + 16.0) * 100) / 100;
      pacDeadline = '6 a 9 dias úteis';
      sedexDeadline = '3 a 4 dias úteis';
    } else if (['PE', 'CE', 'RN', 'PB', 'AL', 'SE', 'PI', 'MA'].includes(destInfo.state)) {
      pacPrice = Math.round((pacBase + 14.0) * 100) / 100;
      sedexPrice = Math.round((sedexBase + 24.0) * 100) / 100;
      pacDeadline = '7 a 11 dias úteis';
      sedexDeadline = '3 a 5 dias úteis';
    } else {
      // Norte: AM, PA, RO, AC, RR, AP, TO
      pacPrice = Math.round((pacBase + 18.0) * 100) / 100;
      sedexPrice = Math.round((sedexBase + 34.0) * 100) / 100;
      pacDeadline = '9 a 14 dias úteis';
      sedexDeadline = '4 a 6 dias úteis';
    }

    const options: ShippingOption[] = [
      {
        id: 'pac',
        name: 'PAC Correios (Econômico)',
        carrier: 'Correios Brasil',
        service: 'PAC',
        deadline: pacDeadline,
        price: isFreeQualified ? 0 : pacPrice,
        originalPrice: pacPrice,
        isFree: isFreeQualified,
      },
      {
        id: 'sedex',
        name: 'SEDEX Correios (Expresso)',
        carrier: 'Correios Brasil',
        service: 'SEDEX',
        deadline: sedexDeadline,
        price: sedexPrice,
        originalPrice: sedexPrice,
        isFree: false,
      },
    ];

    return {
      origin: {
        postalCode: `${originCep.slice(0, 5)}-${originCep.slice(5)}`,
        street: settings.street,
        city: settings.city,
        state: settings.state,
      },
      destination: {
        postalCode: `${rawDest.slice(0, 5)}-${rawDest.slice(5)}`,
        city: destInfo.city,
        state: destInfo.state,
      },
      freeShippingQualified: isFreeQualified,
      freeShippingThreshold: freeMin,
      options,
    };
  }

  /**
   * Resolução inteligente do estado/região pelo prefixo do CEP brasileiro
   */
  private resolveCepRegion(cep: string): { state: string; city: string } {
    const num = parseInt(cep.slice(0, 5), 10);

    if (num >= 1000 && num <= 19999) return { state: 'SP', city: num <= 9999 ? 'São Paulo' : 'Interior/Litoral de SP' };
    if (num >= 20000 && num <= 28999) return { state: 'RJ', city: 'Rio de Janeiro' };
    if (num >= 29000 && num <= 29999) return { state: 'ES', city: 'Vitória' };
    if (num >= 30000 && num <= 39999) return { state: 'MG', city: 'Belo Horizonte' };
    if (num >= 40000 && num <= 48999) return { state: 'BA', city: 'Salvador' };
    if (num >= 49000 && num <= 49999) return { state: 'SE', city: 'Aracaju' };
    if (num >= 50000 && num <= 56999) return { state: 'PE', city: 'Recife' };
    if (num >= 57000 && num <= 57999) return { state: 'AL', city: 'Maceió' };
    if (num >= 58000 && num <= 58999) return { state: 'PB', city: 'João Pessoa' };
    if (num >= 59000 && num <= 59999) return { state: 'RN', city: 'Natal' };
    if (num >= 60000 && num <= 63999) return { state: 'CE', city: 'Fortaleza' };
    if (num >= 64000 && num <= 64999) return { state: 'PI', city: 'Teresina' };
    if (num >= 65000 && num <= 65999) return { state: 'MA', city: 'São Luís' };
    if (num >= 66000 && num <= 68899) return { state: 'PA', city: 'Belém' };
    if (num >= 68900 && num <= 68999) return { state: 'AP', city: 'Macapá' };
    if (num >= 69000 && num <= 69299 || num >= 69400 && num <= 69899) return { state: 'AM', city: 'Manaus' };
    if (num >= 69300 && num <= 69399) return { state: 'RR', city: 'Boa Vista' };
    if (num >= 69900 && num <= 69999) return { state: 'AC', city: 'Rio Branco' };
    if (num >= 70000 && num <= 72799 || num >= 73000 && num <= 73699) return { state: 'DF', city: 'Brasília' };
    if (num >= 72800 && num <= 72999 || num >= 73700 && num <= 76799) return { state: 'GO', city: 'Goiânia' };
    if (num >= 76800 && num <= 76999) return { state: 'RO', city: 'Porto Velho' };
    if (num >= 77000 && num <= 77999) return { state: 'TO', city: 'Palmas' };
    if (num >= 78000 && num <= 78899) return { state: 'MT', city: 'Cuiabá' };
    if (num >= 79000 && num <= 79999) return { state: 'MS', city: 'Campo Grande' };
    if (num >= 80000 && num <= 87999) return { state: 'PR', city: 'Curitiba' };
    if (num >= 88000 && num <= 89999) return { state: 'SC', city: 'Florianópolis' };
    if (num >= 90000 && num <= 99999) return { state: 'RS', city: 'Porto Alegre' };

    return { state: 'BR', city: 'Brasil' };
  }

  /**
   * Consulta dados de um CEP com múltiplos fallbacks (ViaCEP, BrasilAPI e Resolução Regional)
   */
  async lookupCep(rawCep: string) {
    const clean = (rawCep || '').replace(/\D/g, '');
    if (clean.length !== 8) {
      throw new BadRequestException('CEP inválido. Deve conter 8 dígitos numéricos.');
    }

    // 1. Tentar ViaCEP via backend (sem CORS)
    try {
      const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`, {
        headers: { 'User-Agent': 'Lume-Store/1.0' },
      });
      if (res.ok) {
        const data: any = await res.json();
        if (!data.erro) {
          return {
            cep: data.cep || `${clean.slice(0, 5)}-${clean.slice(5)}`,
            logradouro: data.logradouro || '',
            complemento: data.complemento || '',
            bairro: data.bairro || '',
            localidade: data.localidade || '',
            uf: data.uf || '',
            erro: false,
          };
        }
      }
    } catch (_) {}

    // 2. Tentar BrasilAPI como fallback
    try {
      const res2 = await fetch(`https://brasilapi.com.br/api/cep/v1/${clean}`);
      if (res2.ok) {
        const data2: any = await res2.json();
        return {
          cep: data2.cep ? `${data2.cep.slice(0, 5)}-${data2.cep.slice(5)}` : `${clean.slice(0, 5)}-${clean.slice(5)}`,
          logradouro: data2.street || '',
          complemento: '',
          bairro: data2.neighborhood || '',
          localidade: data2.city || '',
          uf: data2.state || '',
          erro: false,
        };
      }
    } catch (_) {}

    // 3. Fallback para resolução regional se ambas as APIs externas falharem
    const region = this.resolveCepRegion(clean);
    return {
      cep: `${clean.slice(0, 5)}-${clean.slice(5)}`,
      logradouro: '',
      complemento: '',
      bairro: '',
      localidade: region.city,
      uf: region.state,
      erro: false,
    };
  }
}
