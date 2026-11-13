import CryptoKit
import Foundation
import Security
import UserNotifications

// Replaces the relay's placeholder alert with the decrypted notification.
// Keychain names must match src/push/config.ts.
final class NotificationService: UNNotificationServiceExtension {
  private static let keychainService = "sowocial.push:no-auth"  // expo-secure-store appends ":no-auth"
  private static let keysAccount = "push-keys"

  private var contentHandler: ((UNNotificationContent) -> Void)?
  private var content: UNMutableNotificationContent?

  override func didReceive(
    _ request: UNNotificationRequest, withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
  ) {
    self.contentHandler = contentHandler
    let content = (request.content.mutableCopy() as? UNMutableNotificationContent) ?? UNMutableNotificationContent()
    self.content = content

    if let message = Self.message(in: request.content.userInfo),
      let body = WebPush.fromBase64(message),
      let keys = Self.loadKeys(),
      let json = try? WebPush.decrypt(body, keys: keys),
      let push = try? JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any]
    {
      if let title = push["title"] as? String { content.title = title }
      if let text = push["body"] as? String { content.body = text }
      // Bluesky pushes name their DID, which the tap handler matches like a fediverse token hash.
      if let did = push["did"] as? String {
        content.userInfo["accountHash"] = SHA256.hash(data: Data(did.utf8)).map { String(format: "%02x", $0) }.joined()
      }
    }
    contentHandler(content)
  }

  // Out of time: show the placeholder rather than nothing.
  override func serviceExtensionTimeWillExpire() {
    if let contentHandler, let content { contentHandler(content) }
  }

  private static func message(in userInfo: [AnyHashable: Any]) -> String? {
    userInfo["m"] as? String
  }

  private static func loadKeys() -> WebPush.Keys? {
    guard let prefix = Bundle.main.object(forInfoDictionaryKey: "AppIdentifierPrefix") as? String,
      let extensionId = Bundle.main.bundleIdentifier, extensionId.hasSuffix(".push")
    else { return nil }
    let appId = String(extensionId.dropLast(".push".count))
    let account = Data(keysAccount.utf8)
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: keychainService,
      kSecAttrGeneric as String: account,
      kSecAttrAccount as String: account,
      kSecAttrAccessGroup as String: prefix + appId,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var item: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
      let data = item as? Data,
      let stored = try? JSONSerialization.jsonObject(with: data) as? [String: String],
      let privateKey = stored["privateKey"].flatMap(WebPush.fromBase64),
      let publicKey = stored["publicKey"].flatMap(WebPush.fromBase64),
      let auth = stored["auth"].flatMap(WebPush.fromBase64)
    else { return nil }
    return WebPush.Keys(privateKey: privateKey, publicKey: publicKey, auth: auth)
  }
}
