package com.vsacoe.metadata.ui

import android.graphics.Bitmap
import android.net.Uri
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.lifecycle.ViewModelProvider
import com.vsacoe.metadata.MainActivity
import com.vsacoe.metadata.core.TestFiles
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import kotlinx.coroutines.launch

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w411dp-h891dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class AppFlowTest {
    @get:Rule
    val rule = createAndroidComposeRule<MainActivity>()

    private fun shot(name: String) {
        val dir = System.getProperty("screenshots.dir") ?: return
        rule.waitForIdle()
        val view = rule.activity.window.decorView
        val bmp = Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888)
        rule.runOnUiThread { view.draw(android.graphics.Canvas(bmp)) }
        File(dir).mkdirs()
        File(dir, "$name.png").outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }

    @Test
    fun onboardingThenHomeThenEditor() {
        rule.onNodeWithText("Добро пожаловать!").assertIsDisplayed()
        shot("1_onboarding_welcome")
        rule.onNodeWithText("Далее").performClick()
        rule.onNodeWithText("Шаг 1. Выберите файл").assertIsDisplayed()
        rule.onNodeWithText("Далее").performClick()
        rule.waitForIdle()
        shot("2_onboarding_fields")
        repeat(3) { rule.onNodeWithText("Далее").performClick() }
        rule.onNodeWithText("Что поддерживается").assertIsDisplayed()
        rule.onNodeWithText("Начать работу").performClick()

        rule.onNodeWithText("📂  Выбрать файл").assertIsDisplayed()
        shot("3_home")

        val vm = ViewModelProvider(rule.activity)[MainViewModel::class.java]
        val file = TestFiles.fixture("doc.docx")
        rule.runOnUiThread { vm.open(Uri.fromFile(file)) }
        val msgs = mutableListOf<String>()
        val job = kotlinx.coroutines.GlobalScope.launch(kotlinx.coroutines.Dispatchers.Unconfined) { vm.messages.collect { msgs += it } }
        try {
            rule.waitUntil(10_000) {
                org.robolectric.Shadows.shadowOf(android.os.Looper.getMainLooper()).idle()
                vm.doc != null
            }
        } catch (e: Throwable) {
            throw AssertionError("busy=${vm.busy} msgs=$msgs", e)
        } finally { job.cancel() }
        rule.onNodeWithText("doc.docx", substring = true).assertIsDisplayed()
        rule.onNodeWithText("Название").assertIsDisplayed()
        rule.onNodeWithText("Понятно").assertIsDisplayed()
        shot("4_editor")
    }
}
