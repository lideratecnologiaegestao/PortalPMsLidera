import { redirect } from 'next/navigation';
import { getCurrentUser } from '../../lib/auth';
import MinhasManifestacoes from '../../components/portal/MinhasManifestacoes';
import ContatosNotificacao from '../../components/portal/ContatosNotificacao';

const NIVEL_LABEL: Record<number, string> = { 1: 'Bronze', 2: 'Prata', 3: 'Ouro' };

// Papéis internos: além do painel do cidadão, têm acesso ao Painel do Servidor.
const INTERNOS = new Set(['servidor', 'gestor', 'ouvidor', 'admin_prefeitura', 'super_admin']);

/**
 * Painel do CIDADÃO (qualquer pessoa logada — inclusive servidores, que também
 * são cidadãos). Sem sessão, manda para /entrar (que oferece e-mail+senha E
 * gov.br). Servidores veem um atalho para o Painel do Servidor.
 */
export default async function CidadaoPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/entrar?redirect=/cidadao');

  const ehInterno = INTERNOS.has(user.role);
  const selo = user.nivel ? NIVEL_LABEL[user.nivel] ?? '—' : null;

  return (
    <section className="mx-auto max-w-5xl px-4 py-8 space-y-4">
      <h1 className="font-heading text-2xl font-bold">Painel do Cidadão</h1>

      {ehInterno && (
        <a href="/servidor" className="block rounded-lg border border-primary bg-primary/5 p-4">
          <span className="font-semibold text-primary">Você também é servidor →</span>{' '}
          <span className="text-fg/80">acessar o Painel do Servidor</span>
        </a>
      )}

      {selo && <p className="text-sm text-fg/70">Selo de confiabilidade gov.br: <strong>{selo}</strong></p>}

      <nav className="flex flex-wrap gap-3 pt-2" aria-label="Ações do cidadão">
        <a href="/ouvidoria" className="rounded border border-primary p-3 hover:bg-primary hover:text-primary-fg">
          + Nova manifestação (Ouvidoria)
        </a>
        <a href="/esic" className="rounded border border-primary p-3 hover:bg-primary hover:text-primary-fg">
          + Novo pedido de informação (e-SIC)
        </a>
        <a href="/cidadao/meus-dados" className="rounded border border-primary p-3 hover:bg-primary hover:text-primary-fg">
          Meus Dados e Direitos (LGPD)
        </a>
      </nav>

      <div className="space-y-3 pt-4">
        <h2 className="font-heading text-xl font-bold">Minhas manifestações e pedidos</h2>
        <MinhasManifestacoes />
      </div>

      <div className="pt-4">
        <ContatosNotificacao />
      </div>
    </section>
  );
}
