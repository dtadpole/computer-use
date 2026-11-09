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

/**
 * IDEs (CU-271, CU-279): an id, or a prefix ending in '.' for a vendor's family. Running code there is the owner's call,
 * and an integrated terminal runs what is typed. Sources: cu-researcher on CU-279 (Fleet's software catalog); the rest
 * kept from #119's list. Cursor only by its exact id: com.todesktop. is every ToDesktop-built app.
 */
export const IDE_APPS = Object.freeze([
  Object.freeze({ app: 'Visual Studio Code', ids: Object.freeze(['com.microsoft.VSCode']), source: "Fleet's software catalog (cu-researcher on CU-279)" }),
  Object.freeze({ app: 'VS Code family', ids: Object.freeze(['com.microsoft.VSCodeInsiders', 'com.visualstudio.code.oss', 'com.vscodium']), source: "#119's list" }),
  Object.freeze({ app: 'Cursor', ids: Object.freeze(['com.todesktop.230313mzl4w4u92']), source: "Fleet's software catalog (cu-researcher on CU-279)" }),
  Object.freeze({ app: 'Zed', ids: Object.freeze(['dev.zed.Zed']), source: "Fleet's software catalog (cu-researcher on CU-279)" }),
  Object.freeze({ app: 'JetBrains IDEs', ids: Object.freeze(['com.jetbrains.']), source: "Fleet's software catalog (cu-researcher on CU-279: intellij, pycharm, pycharm.ce, WebStorm, goland under com.jetbrains.)" }),
  Object.freeze({ app: 'Other IDEs', ids: Object.freeze(['com.apple.dt.Xcode', 'com.google.android.studio', 'com.sublimetext.', 'com.panic.nova']), source: "#119's list" }),
])

/** Whether `bundleId` is an IDE's: an exact id (or one below it), or a family prefix ending in '.'. */
export function isIdeApp(bundleId) {
  const id = String(bundleId ?? '').toLowerCase()
  if (id === '') return false
  return IDE_APPS.some((entry) => entry.ids.some((one) => {
    const known = one.toLowerCase()
    return known.endsWith('.') ? id.startsWith(known) : id === known || id.startsWith(`${known}.`)
  }))
}

/** Whether `bundleId` is a messaging app's, by exact id. */
export function isMessagingApp(bundleId) {
  return typeof bundleId === 'string' && MESSAGING_IDS.has(bundleId)
}
