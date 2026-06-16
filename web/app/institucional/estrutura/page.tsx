import type { Metadata } from 'next';
import { getEstrutura, type EstruturaOrgao, type EstruturaAutoridade } from '../../../lib/portal-api';
import PageContainer from '../../../components/portal/PageContainer';
import SecaoTitulo from '../../../components/portal/SecaoTitulo';

export const revalidate = 120;

export const metadata: Metadata = {
  title: 'Estrutura Organizacional',
  description: 'Estrutura organizacional do município: gabinete, secretarias, órgãos de controle e suas unidades.',
};

const CARGO_LABEL: Record<string, string> = {
  prefeito: 'Prefeito(a)',
  vice_prefeito: 'Vice-prefeito(a)',
  primeira_dama: 'Primeira-dama',
  chefe_gabinete: 'Chefe de Gabinete',
  outro: '',
};

const TIPO_GRUPO: { tipo: string; titulo: string }[] = [
  { tipo: 'secretaria', titulo: 'Secretarias' },
  { tipo: 'departamento', titulo: 'Departamentos' },
  { tipo: 'autarquia', titulo: 'Autarquias' },
  { tipo: 'fundacao', titulo: 'Fundações' },
  { tipo: 'fundo', titulo: 'Fundos Municipais' },
  { tipo: 'empresa', titulo: 'Empresas Públicas' },
  { tipo: 'outro', titulo: 'Outros Órgãos' },
];

const TIPO_CONTROLE: Record<string, string> = {
  procuradoria: 'Procuradoria Jurídica',
  controladoria: 'Controladoria Interna',
  contabilidade: 'Contabilidade',
};

function Iniciais({ nome }: { nome: string }) {
  const i = nome.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
  return (
    <div aria-hidden="true" className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary">
      {i}
    </div>
  );
}

function Foto({ url, nome }: { url?: string | null; nome: string }) {
  if (!url) return <Iniciais nome={nome} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={`Foto de ${nome}`} className="h-16 w-16 shrink-0 rounded-full border-2 border-primary/20 object-cover" />;
}

export default async function EstruturaPage() {
  const e = await getEstrutura();

  if (!e || (!e.gabinete && e.controle.length === 0 && e.orgaos.length === 0)) {
    return (
      <PageContainer>
        <SecaoTitulo>Estrutura Organizacional</SecaoTitulo>
        <p className="rounded border border-border bg-muted p-6 text-center text-fg/70">
          A estrutura organizacional ainda não foi cadastrada.
        </p>
      </PageContainer>
    );
  }

  const gab = e.gabinete;
  const autoridades = gab?.autoridades ?? [];
  const grupos = TIPO_GRUPO.map((g) => ({ ...g, itens: e.orgaos.filter((o) => o.tipo === g.tipo) })).filter((g) => g.itens.length > 0);

  return (
    <PageContainer>
      <SecaoTitulo>Estrutura Organizacional</SecaoTitulo>

      {/* Liderança / Gabinete */}
      {(gab || autoridades.length > 0) && (
        <section className="mb-12">
          <h2 className="mb-4 font-heading text-xl font-bold text-fg">{gab?.nome ?? 'Gabinete do Prefeito'}</h2>
          {autoridades.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {autoridades.map((a) => <AutoridadeCard key={a.id} a={a} />)}
            </div>
          ) : (
            <p className="text-sm text-fg/60">Autoridades não cadastradas.</p>
          )}
        </section>
      )}

      {/* Órgãos de controle e assessoramento */}
      {e.controle.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-1 font-heading text-xl font-bold text-fg">Controle e Assessoramento</h2>
          <p className="mb-4 text-sm text-fg/60">Órgãos de controle interno e assessoramento jurídico/contábil.</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {e.controle.map((o) => <ControleCard key={o.id} o={o} />)}
          </div>
        </section>
      )}

      {/* Organograma — órgãos por tipo, com unidades */}
      {grupos.map((g) => (
        <section key={g.tipo} className="mb-12">
          <h2 className="mb-4 font-heading text-xl font-bold text-fg">{g.titulo}</h2>
          <div className="space-y-4">
            {g.itens.map((o) => <OrgaoCard key={o.id} o={o} />)}
          </div>
        </section>
      ))}
    </PageContainer>
  );
}

function AutoridadeCard({ a }: { a: EstruturaAutoridade }) {
  const cargo = CARGO_LABEL[a.cargo] ?? '';
  return (
    <article className="flex flex-col items-center gap-3 rounded-xl border border-border bg-bg p-5 text-center shadow-sm">
      <Foto url={a.fotoUrl} nome={a.nome} />
      <div>
        {cargo && <p className="text-xs font-semibold uppercase tracking-wide text-accent">{cargo}</p>}
        <h3 className="font-heading text-base font-bold text-primary">{a.nome}</h3>
        {a.email && <p className="mt-1 break-all text-xs text-fg/60">{a.email}</p>}
        {a.telefone && <p className="text-xs text-fg/60">{a.telefone}</p>}
      </div>
    </article>
  );
}

function ControleCard({ o }: { o: EstruturaOrgao }) {
  const Inner = (
    <article className="flex h-full items-center gap-4 rounded-xl border border-primary/30 bg-primary/5 p-4 transition-colors hover:border-primary">
      <Foto url={o.fotoUrl} nome={o.responsavel || o.nome} />
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent">{TIPO_CONTROLE[o.tipo] ?? o.nome}</p>
        <h3 className="font-heading text-base font-bold text-primary">{o.nome}</h3>
        {o.responsavel && <p className="text-sm text-fg/80">{o.responsavel}{o.secretarioCargo ? ` — ${o.secretarioCargo}` : ''}</p>}
        {o.telefone && <p className="text-xs text-fg/60">{o.telefone}</p>}
      </div>
    </article>
  );
  return o.slug ? <a href={`/secretarias/${o.slug}`} className="block">{Inner}</a> : Inner;
}

function OrgaoCard({ o }: { o: EstruturaOrgao }) {
  return (
    <article className="rounded-xl border border-border bg-bg p-5 shadow-sm">
      <div className="flex items-start gap-4">
        <Foto url={o.fotoUrl} nome={o.responsavel || o.nome} />
        <div className="min-w-0 flex-1">
          <h3 className="font-heading text-lg font-bold text-primary">
            {o.slug ? <a href={`/secretarias/${o.slug}`} className="hover:underline">{o.nome}</a> : o.nome}
            {o.sigla && <span className="ml-2 text-sm font-normal text-fg/50">({o.sigla})</span>}
          </h3>
          {o.responsavel && <p className="text-sm text-fg/80">{o.responsavel}{o.secretarioCargo ? ` — ${o.secretarioCargo}` : ''}</p>}
          <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-fg/60">
            {o.telefone && <span>{o.telefone}</span>}
            {o.email && <span className="break-all">{o.email}</span>}
          </div>
        </div>
      </div>

      {o.unidades.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg/50">Unidades</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {o.unidades.map((u) => (
              <li key={u.id} className="rounded border border-border bg-muted/30 px-3 py-2 text-sm">
                <span className="font-medium text-fg">{u.nome}</span>
                {u.sigla && <span className="text-fg/50"> ({u.sigla})</span>}
                {u.responsavel && <span className="block text-xs text-fg/60">{u.responsavel}{u.cargo ? ` — ${u.cargo}` : ''}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}
