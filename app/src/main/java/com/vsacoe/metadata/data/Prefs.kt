package com.vsacoe.metadata.data

import android.content.Context
import androidx.core.content.edit

class Prefs(context: Context) {
    private val sp = context.getSharedPreferences("settings", Context.MODE_PRIVATE)

    var onboardingDone: Boolean
        get() = sp.getBoolean("onboarding_done", false)
        set(v) = sp.edit { putBoolean("onboarding_done", v) }

    var editorTipDone: Boolean
        get() = sp.getBoolean("editor_tip_done", false)
        set(v) = sp.edit { putBoolean("editor_tip_done", v) }
}
