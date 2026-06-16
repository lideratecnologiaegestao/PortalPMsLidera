import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { API_URL } from './config';

/**
 * Push (Expo). Registra o token no backend (`/api/me/push-token`, autenticado),
 * mostra a notificação em foreground e permite abrir a conversa ao tocar
 * (deep-link pelo `data.protocolo` enviado pelo backend).
 */

// Mostra a notificação mesmo com o app aberto.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

/** Registra o device token para o usuário logado (precisa do Bearer). */
export async function registrarPush(token: string): Promise<string | null> {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Atualizações',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const projectId = (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId;
  let pushToken: string;
  try {
    pushToken = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
  } catch {
    return null; // em Expo Go sem projectId em alguns casos
  }

  try {
    await fetch(`${API_URL}/api/me/push-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ token: pushToken, plataforma: Platform.OS }),
    });
  } catch {
    /* segue mesmo se o backend estiver fora */
  }
  return pushToken;
}

/** Ao tocar numa notificação, chama `onProtocolo` com o protocolo (deep-link). */
export function ouvirToquesPush(onProtocolo: (protocolo: string) => void) {
  const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
    const data = resp.notification.request.content.data as { protocolo?: string } | undefined;
    if (data?.protocolo) onProtocolo(data.protocolo);
  });
  return () => sub.remove();
}
