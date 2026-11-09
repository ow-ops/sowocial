import CryptoKit
import Foundation

// RFC 8291 decryption for Web Push. Mirrors src/push/webpush.ts.
enum WebPush {
  struct Keys {
    let privateKey: Data
    let publicKey: Data
    let auth: Data
  }

  enum Failure: Error {
    case malformed
    case notFinalRecord
  }

  static func decrypt(_ body: Data, keys: Keys) throws -> String {
    let bytes = [UInt8](body)
    guard bytes.count > 21 else { throw Failure.malformed }
    let idLength = Int(bytes[20])
    guard idLength == 65, bytes.count >= 21 + idLength + 17 else { throw Failure.malformed }
    let salt = Data(bytes[0..<16])
    let serverKey = Data(bytes[21..<(21 + idLength)])
    let ciphertext = Data(bytes[(21 + idLength)...])

    let privateKey = try P256.KeyAgreement.PrivateKey(rawRepresentation: keys.privateKey)
    let shared = try privateKey.sharedSecretFromKeyAgreement(
      with: P256.KeyAgreement.PublicKey(x963Representation: serverKey))
    let ecdh = shared.withUnsafeBytes { Data($0) }

    let keyInfo = Data("WebPush: info\0".utf8) + keys.publicKey + serverKey
    let ikm = HKDF<SHA256>.deriveKey(
      inputKeyMaterial: SymmetricKey(data: ecdh), salt: keys.auth, info: keyInfo, outputByteCount: 32)
    let cek = HKDF<SHA256>.deriveKey(
      inputKeyMaterial: ikm, salt: salt, info: Data("Content-Encoding: aes128gcm\0".utf8), outputByteCount: 16)
    let nonce = HKDF<SHA256>.deriveKey(
      inputKeyMaterial: ikm, salt: salt, info: Data("Content-Encoding: nonce\0".utf8), outputByteCount: 12)

    let box = try AES.GCM.SealedBox(
      nonce: AES.GCM.Nonce(data: nonce.withUnsafeBytes { Data($0) }),
      ciphertext: ciphertext.dropLast(16),
      tag: ciphertext.suffix(16))
    var padded = [UInt8](try AES.GCM.open(box, using: cek))

    // A single record: the plaintext ends with the 0x02 delimiter and optional zero padding.
    while padded.last == 0 { padded.removeLast() }
    guard padded.last == 2 else { throw Failure.notFinalRecord }
    padded.removeLast()
    return String(decoding: padded, as: UTF8.self)
  }

  static func fromBase64(_ value: String) -> Data? {
    var standard = value.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
    standard += String(repeating: "=", count: (4 - standard.count % 4) % 4)
    return Data(base64Encoded: standard)
  }
}
