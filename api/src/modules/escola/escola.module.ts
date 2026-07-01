import { Module } from '@nestjs/common';
import {
  EscolaAdminController,
  EscolaAlunoController,
  EscolaProfessorController,
  EscolaPublicController,
} from './escola.controller';
import { EscolaService } from './escola.service';
import { CertificadoPdfService } from './certificado-pdf.service';
import { StorageService } from '../storage/storage.service';

/**
 * L4 Escola Legislativa — cursos (módulos → aulas EditorJS), provas (objetivas
 * e dissertativas), fórum, inscrição/área do aluno e certificados PDF com QR +
 * validação pública, com editor visual de templates. Leitura pública;
 * área do aluno (auth), painel do professor (Role.PROFESSOR) e admin (templates).
 * RLS automático via this.prisma.db. Ver specs/escola-legislativa.md.
 */
@Module({
  controllers: [
    EscolaPublicController,
    EscolaAlunoController,
    EscolaProfessorController,
    EscolaAdminController,
  ],
  providers: [EscolaService, CertificadoPdfService, StorageService],
  exports: [EscolaService],
})
export class EscolaModule {}
