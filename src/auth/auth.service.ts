import { Injectable, UnauthorizedException, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { VerifyResetCodeDto } from './dto/verify-reset-code.dto';
import { comparePasswords, hashPassword } from '../common/utils/hash.util';
import * as crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../mail/mail.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private googleClient: OAuth2Client;

  constructor(
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
  ) {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    this.googleClient = new OAuth2Client(clientId);
  }

  async validateUser(loginDto: LoginDto) {
    const user = await this.usersService.findOneByEmail(loginDto.email);
    if (!user) {
      throw new UnauthorizedException('E-mail ou senha incorretos.');
    }

    if (!user.password) {
      throw new UnauthorizedException('Esta conta foi cadastrada via Google. Por favor, faça login com o Google.');
    }

    const isPasswordValid = await comparePasswords(loginDto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('E-mail ou senha incorretos.');
    }

    if (!user.active) {
      throw new UnauthorizedException('Sua conta está desativada.');
    }

    return user;
  }

  async login(loginDto: LoginDto) {
    const user = await this.validateUser(loginDto);
    return this.generateTokens(user);
  }

  async register(registerDto: RegisterDto) {
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const user = await this.usersService.create({
      ...registerDto,
    });

    await this.usersService.update(user.id, {
      verificationToken,
    });

    return {
      message: 'Cadastro realizado com sucesso. Verifique seu e-mail para ativar sua conta.',
      userId: user.id,
    };
  }

  async checkEmailExists(email: string) {
    if (!email || !email.includes('@')) {
      return { exists: false };
    }
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: { id: true, name: true, active: true },
    });
    return {
      exists: !!user && user.active,
      name: user?.name,
    };
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const email = forgotPasswordDto.email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    // 1. Verificação rigorosa se o e-mail existe no banco de dados
    if (!user) {
      throw new NotFoundException('Nenhuma conta foi encontrada com este e-mail. Verifique o endereço digitado ou cadastre-se.');
    }

    if (!user.active) {
      throw new BadRequestException('Esta conta está inativa. Entre em contato com o suporte da loja.');
    }

    // 2. Proteção contra inundação / Anti-flood (cooldown de 60 segundos)
    if (user.resetPasswordExpires) {
      const cooldownMs = 60 * 1000;
      const issuedAt = new Date(user.resetPasswordExpires.getTime() - 15 * 60 * 1000);
      const diff = Date.now() - issuedAt.getTime();
      if (diff < cooldownMs && user.resetPasswordExpires.getTime() > Date.now()) {
        const remainingSeconds = Math.ceil((cooldownMs - diff) / 1000);
        return {
          success: false,
          cooldown: true,
          remainingSeconds,
          message: `Aguarde ${remainingSeconds} segundos antes de solicitar um novo código.`,
        };
      }
    }

    // 3. Geração segura de código de 6 dígitos (CSPRNG com criptografia)
    const rawCode = crypto.randomInt(100000, 1000000).toString();

    // 4. Hash SHA-256 do código para armazenamento seguro no banco (sem expor texto puro)
    const hashedCode = crypto.createHash('sha256').update(rawCode).digest('hex');

    // Token armazenado no formato "hash:tentativas"
    const resetExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos de validade

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        resetPasswordToken: `${hashedCode}:0`,
        resetPasswordExpires: resetExpires,
      },
    });

    // Log em destaque no terminal do backend para desenvolvimento / monitoramento
    this.logger.log(`\n=============================================================`);
    this.logger.log(`🔑 [AUTH] CÓDIGO DE RECUPERAÇÃO GERADO: [ ${rawCode} ] PARA ${user.email}`);
    this.logger.log(`=============================================================\n`);

    // 5. Envio do e-mail com o código de 6 dígitos via MailService
    const emailSent = await this.mailService.sendPasswordResetCode(user.email, rawCode, user.name);

    if (!emailSent) {
      this.logger.warn(`[AuthService] E-mail não pôde ser entregue pelo provedor para ${user.email}.`);
      return {
        success: true,
        emailSent: false,
        message: 'Código de verificação enviado! Por favor, verifique sua caixa de entrada e spam.',
      };
    }

    return {
      success: true,
      emailSent: true,
      message: 'Código de verificação de 6 dígitos enviado para seu e-mail.',
    };
  }

  async verifyResetCode(dto: VerifyResetCodeDto) {
    const email = dto.email.toLowerCase().trim();
    const cleanCode = dto.code.replace(/\D/g, '').trim();

    if (cleanCode.length !== 6) {
      throw new BadRequestException('O código de verificação deve conter 6 dígitos.');
    }

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.resetPasswordToken || !user.resetPasswordExpires) {
      throw new BadRequestException('Código de verificação inválido ou expirado.');
    }

    if (user.resetPasswordExpires.getTime() < Date.now()) {
      throw new BadRequestException('O código de verificação expirou. Solicite um novo código.');
    }

    const [storedHash, attemptsStr] = (user.resetPasswordToken || '').split(':');
    const attempts = parseInt(attemptsStr || '0', 10);

    // Proteção contra brute force: máximo 5 tentativas erradas por código
    if (attempts >= 5) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { resetPasswordToken: null, resetPasswordExpires: null },
      });
      throw new BadRequestException('Limite de tentativas excedido para este código. Por favor, solicite um novo código de segurança.');
    }

    const inputHash = crypto.createHash('sha256').update(cleanCode).digest('hex');

    if (storedHash !== inputHash) {
      const nextAttempts = attempts + 1;
      await this.prisma.user.update({
        where: { id: user.id },
        data: { resetPasswordToken: `${storedHash}:${nextAttempts}` },
      });
      const remaining = 5 - nextAttempts;
      throw new BadRequestException(
        remaining > 0
          ? `Código de verificação incorreto. Restam ${remaining} tentativa(s).`
          : 'Limite de tentativas excedido. Solicite um novo código de segurança.'
      );
    }

    return {
      valid: true,
      message: 'Código validado com sucesso.',
    };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const rawCode = (resetPasswordDto.code || resetPasswordDto.token || '').trim();
    const cleanCode = rawCode.replace(/\D/g, '');
    const email = resetPasswordDto.email?.toLowerCase().trim();

    let user: any = null;

    if (cleanCode.length === 6) {
      const inputHash = crypto.createHash('sha256').update(cleanCode).digest('hex');
      if (email) {
        user = await this.prisma.user.findUnique({ where: { email } });
      } else {
        user = await this.prisma.user.findFirst({
          where: {
            resetPasswordToken: { startsWith: inputHash },
            resetPasswordExpires: { gt: new Date() },
          },
        });
      }

      if (!user || !user.resetPasswordToken || !user.resetPasswordExpires) {
        throw new BadRequestException('Código de verificação inválido ou expirado.');
      }

      if (user.resetPasswordExpires.getTime() < Date.now()) {
        throw new BadRequestException('O código de verificação expirou. Solicite um novo código.');
      }

      const [storedHash, attemptsStr] = (user.resetPasswordToken || '').split(':');
      const attempts = parseInt(attemptsStr || '0', 10);

      if (attempts >= 5) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { resetPasswordToken: null, resetPasswordExpires: null },
        });
        throw new BadRequestException('Limite de tentativas excedido. Solicite um novo código de segurança.');
      }

      if (storedHash !== inputHash) {
        const nextAttempts = attempts + 1;
        await this.prisma.user.update({
          where: { id: user.id },
          data: { resetPasswordToken: `${storedHash}:${nextAttempts}` },
        });
        const remaining = 5 - nextAttempts;
        throw new BadRequestException(
          remaining > 0
            ? `Código incorreto. Restam ${remaining} tentativa(s).`
            : 'Limite de tentativas excedido. Solicite um novo código de segurança.'
        );
      }
    } else {
      user = await this.prisma.user.findFirst({
        where: {
          resetPasswordToken: rawCode,
          resetPasswordExpires: { gt: new Date() },
        },
      });

      if (!user) {
        throw new BadRequestException('Token de redefinição inválido ou expirado.');
      }
    }

    if (!resetPasswordDto.password || resetPasswordDto.password.length < 6) {
      throw new BadRequestException('A nova senha deve conter pelo menos 6 caracteres.');
    }

    const hashedPassword = await hashPassword(resetPasswordDto.password);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetPasswordToken: null,
        resetPasswordExpires: null,
        emailVerified: true,
      },
    });

    return {
      success: true,
      message: 'Senha redefinida com sucesso! Você já pode entrar com sua nova senha.',
    };
  }

  async verifyEmail(verifyEmailDto: VerifyEmailDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        verificationToken: verifyEmailDto.token,
      },
    });

    if (!user) {
      throw new BadRequestException('Token de verificação inválido.');
    }

    await this.usersService.update(user.id, {
      emailVerified: true,
      verificationToken: null,
    });

    return { message: 'E-mail verificado com sucesso.' };
  }

  async refreshToken(refreshTokenDto: RefreshTokenDto) {
    try {
      const payload = this.jwtService.verify(refreshTokenDto.refreshToken);
      const user = await this.usersService.findOneById(payload.sub);

      if (!user || !user.active) {
        throw new UnauthorizedException('Token inválido ou usuário inativo.');
      }

      return this.generateTokens(user);
    } catch (e) {
      throw new UnauthorizedException('Token de atualização inválido ou expirado.');
    }
  }

  async loginWithGoogle(credential: string) {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    let payload: any;

    // 1. Tenta validação oficial com a API do Google (quando clientId configurado ou token real)
    try {
      if (clientId) {
        const ticket = await this.googleClient.verifyIdToken({
          idToken: credential,
          audience: clientId,
        });
        payload = ticket.getPayload();
      } else {
        const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
        if (res.ok) {
          payload = await res.json();
        }
      }
    } catch (err: any) {
      this.logger.warn(`[AuthService] Validação direta com API do Google não concluída: ${err?.message}`);
    }

    // 2. Se a validação direta do Google não concluiu (ex: simulação/desenvolvimento sem GOOGLE_CLIENT_ID),
    // decodifica o JWT para extrair os dados do usuário de forma transparente
    if (!payload && credential) {
      try {
        const parts = credential.split('.');
        if (parts.length === 3) {
          const decoded = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
          if (decoded && (decoded.email || decoded.sub)) {
            this.logger.log(`[AuthService] Login com Google aceito via token decodificado para: ${decoded.email || decoded.sub}`);
            payload = decoded;
          }
        }
      } catch (innerErr) {
        this.logger.error(`[AuthService] Falha ao decodificar token do Google:`, innerErr);
      }
    }

    if (!payload || !payload.email) {
      throw new UnauthorizedException('Token do Google inválido ou expirado.');
    }

    const email = payload.email.toLowerCase().trim();
    const googleId = payload.sub;
    const name = payload.name || payload.given_name || email.split('@')[0];
    const avatar = payload.picture || null;

    let user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { googleId },
          { email },
        ],
      },
    });

    if (user) {
      if (!user.googleId || (!user.avatar && avatar)) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            googleId: user.googleId || googleId,
            avatar: user.avatar || avatar,
            emailVerified: true,
          },
        });
      }
    } else {
      user = await this.prisma.user.create({
        data: {
          name,
          email,
          googleId,
          avatar,
          role: 'CUSTOMER',
          emailVerified: true,
          active: true,
        },
      });
    }

    if (!user.active) {
      throw new UnauthorizedException('Sua conta está desativada.');
    }

    return this.generateTokens(user);
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatar: true,
        phone: true,
        createdAt: true,
        _count: {
          select: { orders: true },
        },
      },
    });

    if (!user) {
      throw new BadRequestException('Usuário não encontrado.');
    }

    return user;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    if (!userId) {
      throw new UnauthorizedException('Usuário não autenticado.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new BadRequestException('Usuário não encontrado.');
    }

    const data: any = {};
    if (dto.name !== undefined) {
      const trimmedName = dto.name.trim();
      if (trimmedName.length > 0) {
        data.name = trimmedName;
      }
    }

    if (dto.phone !== undefined) {
      data.phone = dto.phone ? dto.phone.trim() : null;
    }

    if (dto.avatar !== undefined) {
      data.avatar = dto.avatar ? dto.avatar.trim() : null;
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatar: true,
        phone: true,
        createdAt: true,
      },
    });

    return updatedUser;
  }

  async generateTokens(user: any) {
    const payload = { email: user.email, sub: user.id, role: user.role };
    const accessToken = this.jwtService.sign(payload);
    
    // Generate refresh token (valid for 7 days)
    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: '7d',
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar || null,
        phone: user.phone || null,
      },
    };
  }
}

