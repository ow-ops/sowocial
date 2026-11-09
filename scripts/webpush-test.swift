// Checks targets/push/WebPush.swift against RFC 8291 Appendix A:
//   swiftc -parse-as-library targets/push/WebPush.swift scripts/webpush-test.swift -o /tmp/webpush-test && /tmp/webpush-test
import Foundation

func b64(_ s: String) -> Data { WebPush.fromBase64(s.replacingOccurrences(of: " ", with: ""))! }

@main
enum WebPushTest {
  static func main() throws {
    let keys = WebPush.Keys(
      privateKey: b64("q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94"),
      publicKey: b64("BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcx aOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4"),
      auth: b64("BTBZMqHH6r4Tts7J_aSIgg"))
    let body =
      b64("DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z 9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml mlMoZIIgDll6e3vCYLocInmYWAmS6Tlz AC8wEqKK6PBru3jl7A8")
      + b64("8pfeW0KbunFT06SuDKoJH9Ql87S1QUrd irN6GcG7sFz1y1sqLgVi1VhjVkHsUoEs bI_0LpXMuGvnzQ")

    let plaintext = try WebPush.decrypt(body, keys: keys)
    guard plaintext == "When I grow up, I want to be a watermelon" else {
      print("FAIL: \(plaintext)")
      exit(1)
    }
    var tampered = [UInt8](body)
    tampered[tampered.count - 1] ^= 1
    guard (try? WebPush.decrypt(Data(tampered), keys: keys)) == nil else {
      print("FAIL: accepted a tampered message")
      exit(1)
    }
    print("ok: RFC 8291 Appendix A decrypts, tampering is rejected")
  }
}
