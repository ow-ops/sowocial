package eu.owops.sowocial.unifiedpush

import android.os.Bundle
import androidx.core.os.bundleOf
import expo.modules.notifications.service.delegates.FirebaseMessagingDelegate
import org.unifiedpush.android.connector.FailedReason
import org.unifiedpush.android.connector.PushService
import org.unifiedpush.android.connector.data.PushEndpoint
import org.unifiedpush.android.connector.data.PushMessage

object UnifiedPushEvents {
  @Volatile
  var listener: ((String, Bundle) -> Unit)? = null
}

class UnifiedPushService : PushService() {
  // Same bundle shape as an FCM message, so the JS push task runs whether or not the app is alive.
  override fun onMessage(message: PushMessage, instance: String) {
    if (!message.decrypted) return
    val data = bundleOf("up" to String(message.content))
    FirebaseMessagingDelegate.runTaskManagerTasks(applicationContext, bundleOf("data" to data))
  }

  override fun onNewEndpoint(endpoint: PushEndpoint, instance: String) {
    val keys = endpoint.pubKeySet ?: return
    UnifiedPushEvents.listener?.invoke(
      "endpoint",
      bundleOf("instance" to instance, "url" to endpoint.url, "pubKey" to keys.pubKey, "auth" to keys.auth),
    )
  }

  override fun onRegistrationFailed(reason: FailedReason, instance: String) {
    UnifiedPushEvents.listener?.invoke("registrationFailed", bundleOf("instance" to instance, "reason" to reason.name))
  }

  // The next app start registers again.
  override fun onUnregistered(instance: String) {}
}
