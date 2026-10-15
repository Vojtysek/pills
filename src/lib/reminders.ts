import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { setNotificationIds, type CabinetItem } from '@/db/cabinet';
import { formatExpiry, reminderDates } from '@/lib/expiry';

const CHANNEL_ID = 'expiry';

/** Call once at startup. */
export function configureReminders() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Expirace léků',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
}

async function ensurePermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

/** Replaces the item's scheduled reminders with ones matching its current expiry date. */
export async function rescheduleReminders(item: CabinetItem): Promise<void> {
  await cancelReminders(item);
  if (!item.expiresOn || !(await ensurePermission())) {
    await setNotificationIds(item.id, []);
    return;
  }

  const expiry = formatExpiry(item.expiresOn);
  const ids = [];
  for (const { kind, date } of reminderDates(item.expiresOn)) {
    ids.push(
      await Notifications.scheduleNotificationAsync({
        content: {
          title: kind === 'soon' ? `${item.name} brzy projde` : `${item.name} je prošlý`,
          body: kind === 'soon' ? `Použitelné do ${expiry}.` : `Platnost skončila ${expiry}. Odneste ho do lékárny.`,
          data: { itemId: item.id },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: CHANNEL_ID },
      })
    );
  }
  await setNotificationIds(item.id, ids);
}

export async function cancelReminders(item: CabinetItem): Promise<void> {
  await Promise.all(item.notificationIds.map((id) => Notifications.cancelScheduledNotificationAsync(id)));
}
