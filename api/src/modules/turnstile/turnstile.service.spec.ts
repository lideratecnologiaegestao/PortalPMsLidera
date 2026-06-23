/**
 * Unit tests para TurnstileService.
 * Cobre: degradação graciosa (sem chaves), token ausente, sucesso, falha, fail-open em erro de rede.
 */
import { TurnstileService } from './turnstile.service';

const buildConfig = (secret?: string, siteKey?: string) => ({
  get: jest.fn((key: string) => {
    if (key === 'TURNSTILE_SECRET_KEY') return secret;
    if (key === 'TURNSTILE_SITE_KEY') return siteKey;
    return undefined;
  }),
});

describe('TurnstileService', () => {
  describe('getConfig', () => {
    it('enabled=false quando nenhuma variável configurada', () => {
      const svc = new TurnstileService(buildConfig() as any);
      expect(svc.getConfig()).toEqual({ enabled: false, siteKey: null });
    });

    it('enabled=false quando só secret configurado', () => {
      const svc = new TurnstileService(buildConfig('sec', undefined) as any);
      expect(svc.getConfig().enabled).toBe(false);
    });

    it('enabled=true e siteKey correto quando ambas as variáveis estão definidas', () => {
      const svc = new TurnstileService(buildConfig('sec', 'site123') as any);
      expect(svc.getConfig()).toEqual({ enabled: true, siteKey: 'site123' });
    });
  });

  describe('verificar', () => {
    it('retorna true (degradação graciosa) quando Turnstile está desabilitado', async () => {
      const svc = new TurnstileService(buildConfig() as any);
      expect(await svc.verificar('qualquer-token', '1.2.3.4')).toBe(true);
    });

    it('retorna true sem chamar a API quando Turnstile está desabilitado', async () => {
      const svc = new TurnstileService(buildConfig() as any);
      const fetchSpy = jest.spyOn(global, 'fetch');
      await svc.verificar(undefined, '1.2.3.4');
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    it('retorna false quando Turnstile está habilitado e token é ausente', async () => {
      const svc = new TurnstileService(buildConfig('sec', 'site') as any);
      expect(await svc.verificar(undefined, '1.2.3.4')).toBe(false);
    });

    it('retorna false quando Turnstile está habilitado e token é string vazia', async () => {
      const svc = new TurnstileService(buildConfig('sec', 'site') as any);
      expect(await svc.verificar('', '1.2.3.4')).toBe(false);
    });

    it('retorna true quando API responde success:true', async () => {
      const svc = new TurnstileService(buildConfig('sec', 'site') as any);
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        json: async () => ({ success: true }),
      } as any);
      expect(await svc.verificar('token-valido', '1.2.3.4')).toBe(true);
    });

    it('retorna false quando API responde success:false', async () => {
      const svc = new TurnstileService(buildConfig('sec', 'site') as any);
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        json: async () => ({ success: false, 'error-codes': ['invalid-input-response'] }),
      } as any);
      expect(await svc.verificar('token-invalido', '1.2.3.4')).toBe(false);
    });

    it('fail-open (true) em erro de rede / timeout da API Cloudflare', async () => {
      const svc = new TurnstileService(buildConfig('sec', 'site') as any);
      jest.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Network error'));
      expect(await svc.verificar('token', '1.2.3.4')).toBe(true);
    });
  });
});
