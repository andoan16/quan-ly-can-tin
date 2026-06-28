import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { prisma } from '../prisma';
import { config } from '../config';

export interface LoginResult {
  token: string;
  user: { id: string; username: string; fullName: string; role: string };
}

export const authService = {
  async login(username: string, password: string): Promise<LoginResult> {
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new Error('Invalid credentials');
    }
    if (!user.isActive) {
      throw new Error('User deactivated');
    }
    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      config.jwtSecret,
      { expiresIn: '8h' }
    );
    return {
      token,
      user: { id: user.id, username: user.username, fullName: user.fullName, role: user.role },
    };
  },
};