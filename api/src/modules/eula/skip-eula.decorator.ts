import { SetMetadata } from '@nestjs/common';

/** Marca uma rota ou controller para ser isento da verificação do EulaGuard. */
export const SKIP_EULA_KEY = 'skipEula';
export const SkipEula = () => SetMetadata(SKIP_EULA_KEY, true);
