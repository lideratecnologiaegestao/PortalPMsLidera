import { headers } from 'next/headers';

const API = process.env.API_URL ?? 'http://localhost:3001';

/** "Desenvolvido por" — identidade da empresa dona da plataforma (Lidera). */
export interface Branding {
  ativo: boolean;
  nome: string | null;
  razaoSocial: string | null;
  cnpj: string | null;
  endereco: string | null;
  email: string | null;
  suporteUrl: string | null;
  whatsapp: string | null;
  siteUrl: string | null;
  logoUrl: string | null;
}

/** Busca o branding global (mesmo para todos os tenants). Server-only. */
export async function getBranding(): Promise<Branding | null> {
  try {
    const host = headers().get('host') ?? '';
    const res = await fetch(`${API}/api/branding?__h=${encodeURIComponent(host)}`, {
      headers: { 'x-forwarded-host': host },
      next: { revalidate: 300, tags: ['branding'] },
    });
    if (!res.ok) return null;
    return (await res.json()) as Branding;
  } catch {
    return null;
  }
}
