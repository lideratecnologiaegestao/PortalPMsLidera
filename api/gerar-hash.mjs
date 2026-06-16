import { randomBytes, scryptSync } from 'node:crypto';
const senha = process.argv[2] ?? '';
const salt = randomBytes(16);
const dk = scryptSync(senha, salt, 64);
console.log(`${salt.toString('hex')}:${dk.toString('hex')}`);
