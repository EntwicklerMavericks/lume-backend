import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
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
import { comparePasswords } from '../common/utils/hash.util';
import * as crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
  private googleClient: OAuth2Client;

  constructor(
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
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

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const user = await this.usersService.findOneByEmail(forgotPasswordDto.email);
    if (!user) {
      // Return a generic message to prevent account enumeration
      return { message: 'Se o e-mail existir, um link de redefinição será enviado.' };
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date();
    resetExpires.setHours(resetExpires.getHours() + 1); // Token is valid for 1 hour

    await this.usersService.update(user.id, {
      resetPasswordToken: resetToken,
      resetPasswordExpires: resetExpires,
    });

    return { message: 'Se o e-mail existir, um link de redefinição será enviado.' };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        resetPasswordToken: resetPasswordDto.token,
        resetPasswordExpires: {
          gt: new Date(),
        },
      },
    });

    if (!user) {
      throw new BadRequestException('Token de redefinição inválido ou expirado.');
    }

    await this.usersService.update(user.id, {
      password: resetPasswordDto.password,
      resetPasswordToken: null,
      resetPasswordExpires: null,
    });

    return { message: 'Senha redefinida com sucesso.' };
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

    try {
      if (clientId) {
        const ticket = await this.googleClient.verifyIdToken({
          idToken: credential,
          audience: clientId,
        });
        payload = ticket.getPayload();
      } else {
        // Fallback or development verify via tokeninfo
        const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
        if (!res.ok) {
          throw new Error('Falha ao validar token junto ao Google.');
        }
        payload = await res.json();
      }
    } catch (err: any) {
      // Direct tokeninfo fallback
      try {
        const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
        if (res.ok) {
          payload = await res.json();
        } else {
          throw new UnauthorizedException('Token do Google inválido ou expirado.');
        }
      } catch (inner) {
        throw new UnauthorizedException('Token do Google inválido ou expirado.');
      }
    }

    if (!payload || !payload.email) {
      throw new UnauthorizedException('Não foi possível obter o e-mail da conta Google.');
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

