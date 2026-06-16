import AsyncStorage from '@react-native-async-storage/async-storage';
import { criarChamado, NovoChamadoInput } from './api';

/**
 * Fila offline-first (spec item 6): se não houver rede ao abrir um chamado, ele
 * é guardado localmente e enviado depois (na próxima abertura do app / quando
 * houver conexão). A foto fica como URI local até o envio.
 */
const KEY = 'chamados_pendentes';

type Pendente = NovoChamadoInput & { criadoEm: number };

export async function listar(): Promise<Pendente[]> {
  const raw = await AsyncStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as Pendente[]) : [];
}

export async function enfileirar(input: NovoChamadoInput): Promise<void> {
  const fila = await listar();
  fila.push({ ...input, criadoEm: Date.now() });
  await AsyncStorage.setItem(KEY, JSON.stringify(fila));
}

/** Tenta enviar os pendentes. Retorna quantos foram. Mantém os que falharem. */
export async function sincronizar(): Promise<number> {
  const fila = await listar();
  if (fila.length === 0) return 0;
  const restantes: Pendente[] = [];
  let enviados = 0;
  for (const item of fila) {
    try {
      await criarChamado(item);
      enviados++;
    } catch {
      restantes.push(item); // continua na fila para a próxima tentativa
    }
  }
  await AsyncStorage.setItem(KEY, JSON.stringify(restantes));
  return enviados;
}

export async function totalPendentes(): Promise<number> {
  return (await listar()).length;
}
