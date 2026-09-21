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
import { comparePasswords } from '../common/utils/hash.util';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(loginDto: LoginDto) {
    const user = await this.usersService.findOneByEmail(loginDto.email);
    if (!user) {
      throw new UnauthorizedException('E-mail ou senha incorretos.');
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

  async generateTokens(user: any) {
    const payload = { email: user.email, sub: user.id, role: user.role };
    const accessToken = this.jwtService.sign(payload);
    
    // Generate refresh token (e.g. valid for 7 days)
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
      },
    };
  }
}
