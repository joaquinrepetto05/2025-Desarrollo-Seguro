
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import db from '../db';
import { User,UserRow } from '../types/user';
import jwtUtils from '../utils/jwt';
import ejs from 'ejs';
import bcrypt from 'bcrypt';

const RESET_TTL = 1000 * 60 * 60;         // 1h
const INVITE_TTL = 1000 * 60 * 60 * 24 * 7; // 7d

class AuthService {

static async createUser(user: User) {
  const existing = await db<UserRow>('users')
    .where({ username: user.username })
    .orWhere({ email: user.email })
    .first();
  if (existing) throw new Error('User already exists with that username or email');

  const invite_token = crypto.randomBytes(6).toString('hex');
  const invite_token_expires = new Date(Date.now() + INVITE_TTL);

  // Hasheamos la contraseña
  const SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS || 10);
  if (!user.password || user.password.length < 8) {
    throw new Error('Password must have at least 8 characters');
  }
  const hashedPassword = await bcrypt.hash(user.password, SALT_ROUNDS);

  await db<UserRow>('users').insert({
    username: user.username,
    password: hashedPassword, // Guardamos el hash de la contraseña
    email: user.email,
    first_name: user.first_name,
    last_name:  user.last_name,
    invite_token,
    invite_token_expires,
    activated: false
  });

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  const link = `${process.env.FRONTEND_URL}/activate-user?token=${invite_token}&username=${user.username}`;

  const template = `
    <html>
      <body>
        <h1>Hello ${user.first_name} ${user.last_name}</h1>
        <p>Click <a href="${ link }">here</a> to activate your account.</p>
      </body>
    </html>`;
    
    const htmlBody = ejs.render(template, {
      firstName: user.first_name,
      lastName: user.last_name,
      activationLink: link
    });

  await transporter.sendMail({
    from: "info@example.com",
    to: user.email,
    subject: 'Activate your account',
    html: htmlBody
  });
}


  static async updateUser(user: User) {
    const existing = await db<UserRow>('users')
      .where({ id: user.id })
      .first();
    if (!existing) throw new Error('User not found');
    await db<UserRow>('users')
      .where({ id: user.id })
      .update({
        username: user.username,
        password: user.password,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name
      });
    return existing;
  }

static async authenticate(username: string, password: string) {
  const user = await db<UserRow>('users')
    .where({ username })
    .andWhere('activated', true)
    .first();
  if (!user) throw new Error('Invalid email or not activated');

  const isMatch = await bcrypt.compare(password, user.password); // Compara con el hash
  if (!isMatch) throw new Error('Invalid password');

  return user;
}

  static async sendResetPasswordEmail(email: string) {
    const user = await db<UserRow>('users')
      .where({ email })
      .andWhere('activated', true)
      .first();
    if (!user) throw new Error('No user with that email or not activated');

    const token = crypto.randomBytes(6).toString('hex');
    const expires = new Date(Date.now() + RESET_TTL);

    await db('users')
      .where({ id: user.id })
      .update({
        reset_password_token: token,
        reset_password_expires: expires
      });

    // send email with reset link using nodemailer and local SMTP server
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    const link = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
    await transporter.sendMail({
      to: user.email,
      subject: 'Your password reset link',
      html: `Click <a href="${link}">here</a> to reset your password.`
    });
  }

  static async resetPassword(token: string, newPassword: string) {
    const row = await db<UserRow>('users')
      .where('reset_password_token', token)
      .andWhere('reset_password_expires', '>', new Date())
      .first();
    if (!row) throw new Error('Invalid or expired reset token');

    await db('users')
      .where({ id: row.id })
      .update({
        password: newPassword,
        reset_password_token: null,
        reset_password_expires: null
      });
  }

  static async setPassword(token: string, newPassword: string) {
    const row = await db<UserRow>('users')
      .where('invite_token', token)
      .andWhere('invite_token_expires', '>', new Date())
      .first();
    if (!row) throw new Error('Invalid or expired invite token');

    await db('users')
      .update({
        password: newPassword,
        invite_token: null,
        invite_token_expires: null
      })
      .where({ id: row.id });
  }

  static generateJwt(userId: string): string {
    return jwtUtils.generateToken(userId);
  }
}

export default AuthService;
