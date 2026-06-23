/**
 * Unit tests para PermissionsService.
 * Testa lógica de permissões efetivas, curinga e herança por grupos.
 *
 * ADR-0005: admin_prefeitura não tem mais curinga '*'.
 * Wildcard é exclusivo do super_admin.
 * gestor não tem ouvidoria.gerenciar nem esic.gerenciar.
 */
import { PermissionsService } from './permissions.service';

const USER_ID = 'user-uuid-1';

const buildPrisma = (grupos: any[] = []) => ({
  db: {
    usuarioGrupo: {
      findMany: jest.fn().mockResolvedValue(grupos),
    },
  },
});

describe('PermissionsService', () => {
  describe('permissoesEfetivas', () => {
    it('super_admin deve ter curinga *', async () => {
      const svc = new PermissionsService(buildPrisma() as any);
      const result = await svc.permissoesEfetivas(USER_ID, 'super_admin');
      expect(result.has('*')).toBe(true);
      // Não deve consultar o banco para papéis com curinga
      const prisma = buildPrisma();
      const svc2 = new PermissionsService(prisma as any);
      await svc2.permissoesEfetivas(USER_ID, 'super_admin');
      expect(prisma.db.usuarioGrupo.findMany).not.toHaveBeenCalled();
    });

    it('admin_prefeitura NÃO deve ter curinga * (ADR-0005)', async () => {
      const svc = new PermissionsService(buildPrisma() as any);
      const result = await svc.permissoesEfetivas(USER_ID, 'admin_prefeitura');
      // ADR-0005: admin_prefeitura tem lista explícita, sem wildcard
      expect(result.has('*')).toBe(false);
    });

    it('admin_prefeitura deve ter permissões de conteúdo e usuários mas NÃO ouvidoria/esic (ADR-0005)', async () => {
      const svc = new PermissionsService(buildPrisma() as any);
      const result = await svc.permissoesEfetivas(USER_ID, 'admin_prefeitura');
      expect(result.has('noticias.gerenciar')).toBe(true);
      expect(result.has('usuarios.gerenciar')).toBe(true);
      expect(result.has('grupos.gerenciar')).toBe(true);
      // Exclusivos do ouvidor
      expect(result.has('ouvidoria.gerenciar')).toBe(false);
      expect(result.has('esic.gerenciar')).toBe(false);
    });

    it('gestor deve ter permissões de conteúdo mas não usuarios/grupos/ouvidoria/esic', async () => {
      const svc = new PermissionsService(buildPrisma() as any);
      const result = await svc.permissoesEfetivas(USER_ID, 'gestor');
      expect(result.has('noticias.gerenciar')).toBe(true);
      expect(result.has('banners.gerenciar')).toBe(true);
      // ADR-0005: gestor não tem ouvidoria nem esic
      expect(result.has('ouvidoria.gerenciar')).toBe(false);
      expect(result.has('esic.gerenciar')).toBe(false);
      expect(result.has('usuarios.gerenciar')).toBe(false);
      expect(result.has('grupos.gerenciar')).toBe(false);
      expect(result.has('*')).toBe(false);
    });

    it('ouvidor deve ter ouvidoria.gerenciar e esic.gerenciar por padrão (ADR-0005)', async () => {
      const svc = new PermissionsService(buildPrisma() as any);
      const result = await svc.permissoesEfetivas(USER_ID, 'ouvidor');
      expect(result.has('ouvidoria.gerenciar')).toBe(true);
      expect(result.has('esic.gerenciar')).toBe(true);
      expect(result.has('noticias.gerenciar')).toBe(false);
    });

    it('assistente_ouvidoria deve ter ouvidoria.gerenciar e esic.gerenciar (ADR-0005)', async () => {
      const svc = new PermissionsService(buildPrisma() as any);
      const result = await svc.permissoesEfetivas(USER_ID, 'assistente_ouvidoria');
      expect(result.has('ouvidoria.gerenciar')).toBe(true);
      expect(result.has('esic.gerenciar')).toBe(true);
      expect(result.has('noticias.gerenciar')).toBe(false);
    });

    it('ti deve ter permissões de conteúdo e usuários mas NÃO ouvidoria/esic (ADR-0005)', async () => {
      const svc = new PermissionsService(buildPrisma() as any);
      const result = await svc.permissoesEfetivas(USER_ID, 'ti');
      expect(result.has('noticias.gerenciar')).toBe(true);
      expect(result.has('usuarios.gerenciar')).toBe(true);
      expect(result.has('ouvidoria.gerenciar')).toBe(false);
      expect(result.has('esic.gerenciar')).toBe(false);
      expect(result.has('*')).toBe(false);
    });

    it('servidor sem grupos deve ter set vazio', async () => {
      const svc = new PermissionsService(buildPrisma([]) as any);
      const result = await svc.permissoesEfetivas(USER_ID, 'servidor');
      expect(result.size).toBe(0);
    });

    it('servidor com grupo ativo deve herdar as permissões do grupo', async () => {
      const grupos = [
        {
          userId: USER_ID,
          grupoId: 'g1',
          grupo: { id: 'g1', ativo: true, permissoes: ['noticias.gerenciar', 'banners.gerenciar'] },
        },
      ];
      const svc = new PermissionsService(buildPrisma(grupos) as any);
      const result = await svc.permissoesEfetivas(USER_ID, 'servidor');
      expect(result.has('noticias.gerenciar')).toBe(true);
      expect(result.has('banners.gerenciar')).toBe(true);
      expect(result.has('galeria.gerenciar')).toBe(false);
    });

    it('servidor com grupo INATIVO não deve herdar permissões', async () => {
      const grupos = [
        {
          userId: USER_ID,
          grupoId: 'g1',
          grupo: { id: 'g1', ativo: false, permissoes: ['noticias.gerenciar'] },
        },
      ];
      const svc = new PermissionsService(buildPrisma(grupos) as any);
      const result = await svc.permissoesEfetivas(USER_ID, 'servidor');
      expect(result.has('noticias.gerenciar')).toBe(false);
    });

    it('deve fazer union de múltiplos grupos ativos', async () => {
      const grupos = [
        {
          userId: USER_ID,
          grupoId: 'g1',
          grupo: { id: 'g1', ativo: true, permissoes: ['noticias.gerenciar'] },
        },
        {
          userId: USER_ID,
          grupoId: 'g2',
          grupo: { id: 'g2', ativo: true, permissoes: ['banners.gerenciar'] },
        },
      ];
      const svc = new PermissionsService(buildPrisma(grupos) as any);
      const result = await svc.permissoesEfetivas(USER_ID, 'servidor');
      expect(result.has('noticias.gerenciar')).toBe(true);
      expect(result.has('banners.gerenciar')).toBe(true);
    });
  });

  describe('tem', () => {
    it('deve retornar true para array vazio de requeridas', async () => {
      const svc = new PermissionsService(buildPrisma() as any);
      expect(await svc.tem(USER_ID, 'servidor', [])).toBe(true);
    });

    it('super_admin (curinga) deve conceder qualquer permissão', async () => {
      const svc = new PermissionsService(buildPrisma() as any);
      expect(await svc.tem(USER_ID, 'super_admin', ['noticias.gerenciar'])).toBe(true);
    });

    it('admin_prefeitura sem wildcard: tem permissão explícita de grupos (ADR-0005)', async () => {
      const svc = new PermissionsService(buildPrisma() as any);
      // admin_prefeitura tem grupos.gerenciar na lista explícita
      expect(await svc.tem(USER_ID, 'admin_prefeitura', ['grupos.gerenciar'])).toBe(true);
      // Mas NÃO tem ouvidoria
      expect(await svc.tem(USER_ID, 'admin_prefeitura', ['ouvidoria.gerenciar'])).toBe(false);
    });

    it('deve retornar false se faltar alguma permissão requerida', async () => {
      const grupos = [
        {
          userId: USER_ID,
          grupoId: 'g1',
          grupo: { id: 'g1', ativo: true, permissoes: ['noticias.gerenciar'] },
        },
      ];
      const svc = new PermissionsService(buildPrisma(grupos) as any);
      // Tem noticias mas não banners
      expect(
        await svc.tem(USER_ID, 'servidor', ['noticias.gerenciar', 'banners.gerenciar']),
      ).toBe(false);
    });

    it('deve retornar true quando todas as requeridas estão presentes', async () => {
      const grupos = [
        {
          userId: USER_ID,
          grupoId: 'g1',
          grupo: {
            id: 'g1',
            ativo: true,
            permissoes: ['noticias.gerenciar', 'banners.gerenciar'],
          },
        },
      ];
      const svc = new PermissionsService(buildPrisma(grupos) as any);
      expect(
        await svc.tem(USER_ID, 'servidor', ['noticias.gerenciar', 'banners.gerenciar']),
      ).toBe(true);
    });
  });
});
