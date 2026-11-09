package eu.owops.sowocial.unifiedpush

import android.content.Context
import android.content.pm.PackageManager
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.unifiedpush.android.connector.UnifiedPush

class UnifiedPushModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("UnifiedPush")

    Events("endpoint", "registrationFailed")

    OnCreate {
      UnifiedPushEvents.listener = { name, payload -> sendEvent(name, payload) }
    }

    OnDestroy {
      UnifiedPushEvents.listener = null
    }

    Function("getDistributors") {
      UnifiedPush.getDistributors(context).map { mapOf("id" to it, "name" to label(it)) }
    }

    Function("getSavedDistributor") {
      UnifiedPush.getSavedDistributor(context)
    }

    Function("saveDistributor") { id: String ->
      UnifiedPush.saveDistributor(context, id)
    }

    Function("register") { instance: String, vapid: String? ->
      try {
        UnifiedPush.register(context, instance, null, vapid)
      } catch (_: UnifiedPush.VapidNotValidException) {
        UnifiedPush.register(context, instance)
      }
    }

    Function("unregister") { instance: String ->
      UnifiedPush.unregister(context, instance)
    }
  }

  private fun label(packageName: String): String =
    try {
      val pm = context.packageManager
      pm.getApplicationLabel(pm.getApplicationInfo(packageName, 0)).toString()
    } catch (_: PackageManager.NameNotFoundException) {
      packageName
    }
}
