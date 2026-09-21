import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { hashPassword } from '../common/utils/hash.util';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async create(createUserDto: CreateUserDto) {
    const existingUser = await this.findOneByEmail(createUserDto.email);
    if (existingUser) {
      throw new ConflictException('E-mail já cadastrado.');
    }

    const hashedPassword = await hashPassword(createUserDto.password);

    const user = await this.prisma.user.create({
      data: {
        name: createUserDto.name,
        email: createUserDto.email,
        password: hashedPassword,
        role: 'CUSTOMER',
      },
    });

    // Strip password from returned object for safety
    const { password, ...result } = user;
    return result;
  }

  async findOneByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async findOneById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }
    return user;
  }

  async update(id: string, updateUserDto: any) {
    await this.findOneById(id);

    const data: any = { ...updateUserDto };
    if (updateUserDto.password) {
      data.password = await hashPassword(updateUserDto.password);
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data,
    });

    const { password, ...result } = updatedUser;
    return result;
  }

  async remove(id: string) {
    await this.findOneById(id);
    await this.prisma.user.delete({
      where: { id },
    });
    return { success: true };
  }
}
