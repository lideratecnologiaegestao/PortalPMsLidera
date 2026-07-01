import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MediaPublicController } from './media-public.controller';
import { MediaTaxonomiasController } from './media-taxonomias.controller';
import { MediaService } from './media.service';
import { MediaStorageService } from './media-storage.service';

/** Biblioteca de Mídia: upload/listagem/acesso por admin; rota pública mascarada. */
@Module({
  controllers: [MediaController, MediaPublicController, MediaTaxonomiasController],
  providers: [MediaService, MediaStorageService],
  exports: [MediaService, MediaStorageService],
})
export class MediaModule {}
