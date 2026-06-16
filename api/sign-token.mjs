import { SignJWT } from 'jose';
const secret = new TextEncoder().encode(process.env.AUTH_JWT_SECRET);
const token = await new SignJWT({ sub: 'admin-test', tenantId: null, role: 'super_admin', nivel: 3, mfa: true })
  .setProtectedHeader({ alg: 'HS256', typ: 'portal+session' })
  .setIssuedAt()
  .setExpirationTime('1h')
  .sign(secret);
console.log(token);
