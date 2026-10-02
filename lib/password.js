import bcrypt from 'bcryptjs';

const ROUNDS = 10;

export async function hashPassword(plain) {
  return bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(plain, hash) {
  // If the stored value is not a bcrypt hash, assume it's plaintext (legacy)
  if (!hash || !hash.startsWith('$2')) {
    return plain === hash;
  }
  return bcrypt.compare(plain, hash);
}

export function isHashed(value) {
  return typeof value === 'string' && value.startsWith('$2');
}
