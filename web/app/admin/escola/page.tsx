'use client';

/**
 * Admin — Escola Cidadã
 *
 * Shell com abas cobrindo o núcleo do módulo (api/src/modules/escola):
 *   - Cursos       → CRUD de cursos + drill-down de módulos, aulas e provas
 *                    (rotas /api/professor/escola/...)
 *   - Inscrições   → fila de correção de provas dissertativas e acompanhamento
 *                    (rotas /api/professor/escola/correcoes)
 *   - Certificados → modelos (templates) e tipos de certificado
 *                    (rotas /api/admin/escola/templates | tipos-certificado)
 *
 * Padrão-ouro copiado de web/app/admin/parlamentar/.
 */

import { useState } from 'react';
import { AdminHeader } from '../_components/ui';
import Cursos from './Cursos';
import Inscricoes from './Inscricoes';
import Certificados from './Certificados';

type Aba = 'cursos' | 'inscricoes' | 'certificados';

const ABAS: { id: Aba; label: string }[] = [
  { id: 'cursos', label: 'Cursos' },
  { id: 'inscricoes', label: 'Inscrições e correções' },
  { id: 'certificados', label: 'Certificados e modelos' },
];

export default function EscolaAdminPage() {
  const [aba, setAba] = useState<Aba>('cursos');

  return (
    <div className="space-y-4">
      <AdminHeader
        title="Escola Cidadã"
        description="Cursos, módulos, aulas, provas, inscrições e certificados da Escola Cidadã."
      />

      {/* Abas */}
      <div className="border-b border-border" role="tablist" aria-label="Seções da Escola Cidadã">
        <div className="flex flex-wrap gap-1">
          {ABAS.map((a) => {
            const ativo = aba === a.id;
            return (
              <button
                key={a.id}
                type="button"
                role="tab"
                id={`tab-${a.id}`}
                aria-selected={ativo}
                aria-controls={`painel-${a.id}`}
                onClick={() => setAba(a.id)}
                className={`-mb-px rounded-t border-b-2 px-4 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary ${
                  ativo
                    ? 'border-primary text-primary'
                    : 'border-transparent text-fg/60 hover:text-fg'
                }`}
              >
                {a.label}
              </button>
            );
          })}
        </div>
      </div>

      <div role="tabpanel" id={`painel-${aba}`} aria-labelledby={`tab-${aba}`}>
        {aba === 'cursos' && <Cursos />}
        {aba === 'inscricoes' && <Inscricoes />}
        {aba === 'certificados' && <Certificados />}
      </div>
    </div>
  );
}
