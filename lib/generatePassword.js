import { randomInt } from 'crypto';

export function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  let pw = '';
  for (let i = 0; i < 14; i++) pw += chars[randomInt(chars.length)];
  return pw;
}
