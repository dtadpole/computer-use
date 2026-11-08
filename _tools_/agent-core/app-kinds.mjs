/**
 * App kinds that change how an action is judged, by exact bundle id, each with where the id comes from. A kind is a
 * fact about the app, not about a field's name: no name rule can follow every compose field's wording (CU-287).
 */

/**
 * Messaging apps (CU-253, CU-287): Return - or Command/Control-Return - in any editable text target that is not a search
 * field sends a message to other people, whatever the field is called ('Message Ann Smith', 'Write a message to Ann').
 * Sources: cu-researcher on CU-287 (public catalogs, exact ids); the rest kept from #52's list.
 */
export const MESSAGING_APPS = Object.freeze([
  Object.freeze({ app: 'Messages', ids: Object.freeze(['com.apple.MobileSMS']), source: "the built-in app's Info.plist; Microsoft Learn's Intune restrictions list" }),
  Object.freeze({ app: 'Messages (older name)', ids: Object.freeze(['com.apple.iChat']), source: "#52's list" }),
  Object.freeze({ app: 'Slack', ids: Object.freeze(['com.tinyspeck.slackmacgap']), source: 'fleetdm.com/software-catalog/slack-darwin' }),
  Object.freeze({ app: 'Microsoft Teams', ids: Object.freeze(['com.microsoft.teams2', 'com.microsoft.teams']), source: 'fleetdm.com/software-catalog/microsoft-teams-darwin (teams2, 2023 on); classic Teams, retired but may linger' }),
  Object.freeze({ app: 'WhatsApp', ids: Object.freeze(['net.whatsapp.WhatsApp', 'desktop.WhatsApp']), source: "fleetdm.com/software-catalog/whatsapp-darwin; pub.dev deeplink_x; desktop.WhatsApp from #52's list" }),
  Object.freeze({ app: 'Telegram', ids: Object.freeze(['ru.keepcoder.Telegram']), source: 'fleetdm.com/software-catalog/telegram-darwin (the App Store client)' }),
  Object.freeze({ app: 'Telegram Desktop', ids: Object.freeze(['com.tdesktop.Telegram', 'org.telegram.desktop']), source: "mole.fit tested-apps/telegram-desktop (Qt client; its debug build com.tdesktop.TelegramDebug is not listed); org.telegram.desktop from #52's list" }),
  Object.freeze({ app: 'Discord', ids: Object.freeze(['com.hnc.Discord']), source: 'fleetdm.com/software-catalog/discord-darwin' }),
  Object.freeze({ app: 'Signal', ids: Object.freeze(['org.whispersystems.signal-desktop']), source: 'fleetdm.com/software-catalog/signal-darwin' }),
  Object.freeze({ app: 'Messenger', ids: Object.freeze(['com.facebook.archon']), source: "#52's list" }),
])

const MESSAGING_IDS = new Set(MESSAGING_APPS.flatMap((entry) => entry.ids))

/** Whether `bundleId` is a messaging app's, by exact id. */
export function isMessagingApp(bundleId) {
  return typeof bundleId === 'string' && MESSAGING_IDS.has(bundleId)
}
