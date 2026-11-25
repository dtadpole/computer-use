import { mkdirSync, writeFileSync } from 'node:fs'

/**
 * CU-808 (cu-coordinator 25 Nov 12:33Z): what keeps every Chrome a [cu] job starts from letting a notification reach macOS.
 * A UserNotificationCenter dialog appeared on the owner's screen during a window of headless browser rows; the agent's
 * Chrome had only `--deny-permission-prompts`, which denies web permission prompts but leaves Chrome's own notification
 * bridge to the OS. Three layers, used by the agent's Chrome (launch.mjs) and by the verify kit's check browser and the
 * live-view probe (verify-kit/guarded-page.mjs):
 * - the Web Notifications API off (`--disable-notifications`), web permission prompts denied;
 * - Chrome's system / native notification bridge off (`SystemNotifications`, `NativeNotifications` in `--disable-features`);
 * - the throwaway profile seeded with notifications blocked for every site before Chrome first reads it.
 */

/** The features that route a notification to the OS; they go into a launcher's one `--disable-features` switch. */
export const NO_NOTIFICATION_FEATURES = Object.freeze(['SystemNotifications', 'NativeNotifications'])

/**
 * The switches for a launcher that passes no `--disable-features` of its own (the vendored launcher). Chrome reads only the
 * last `--disable-features` switch, so a launcher that has one must merge NO_NOTIFICATION_FEATURES into it instead.
 */
export const NO_NOTIFICATION_ARGS = Object.freeze(['--disable-notifications', '--deny-permission-prompts', `--disable-features=${NO_NOTIFICATION_FEATURES.join(',')}`])

/** A fresh profile's preferences: notifications blocked for every site (content setting 2), no site excepted. */
export const PROFILE_PREFERENCES = Object.freeze({
  profile: { default_content_setting_values: { notifications: 2 }, content_settings: { exceptions: { notifications: {} } } },
})

/** Write `<profile>/Default/Preferences` with notifications blocked. The caller checks that `profile` is its own throwaway one. */
export function writeNoNotificationPreferences(profile, { mkdir = mkdirSync, write = writeFileSync } = {}) {
  if (typeof profile !== 'string' || profile.length === 0) throw new TypeError('writeNoNotificationPreferences needs a profile path')
  mkdir(`${profile}/Default`, { recursive: true })
  write(`${profile}/Default/Preferences`, JSON.stringify(PROFILE_PREFERENCES))
}
