package com.vsacoe.metadata

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContract
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.IntentCompat
import com.vsacoe.metadata.data.Formats
import com.vsacoe.metadata.ui.AppTheme
import com.vsacoe.metadata.ui.EditorScreen
import com.vsacoe.metadata.ui.HomeScreen
import com.vsacoe.metadata.ui.MainViewModel
import com.vsacoe.metadata.ui.OnboardingScreen

class MainActivity : ComponentActivity() {
    private val vm: MainViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        if (savedInstanceState == null) handleIntent(intent)
        setContent { AppTheme { App(vm) } }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    /** Files shared to the app or opened with it from a file manager. */
    private fun handleIntent(intent: Intent?) {
        val uri = when (intent?.action) {
            Intent.ACTION_SEND -> IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri::class.java)
            Intent.ACTION_VIEW, Intent.ACTION_EDIT -> intent.data
            else -> null
        } ?: return
        vm.open(uri)
    }
}

/** ACTION_CREATE_DOCUMENT with a MIME type chosen at launch time. Input: file name to MIME type. */
private class CreateFile : ActivityResultContract<Pair<String, String>, Uri?>() {
    override fun createIntent(context: Context, input: Pair<String, String>) =
        Intent(Intent.ACTION_CREATE_DOCUMENT)
            .addCategory(Intent.CATEGORY_OPENABLE)
            .setType(input.second)
            .putExtra(Intent.EXTRA_TITLE, input.first)

    override fun parseResult(resultCode: Int, intent: Intent?): Uri? = intent?.takeIf { resultCode == android.app.Activity.RESULT_OK }?.data
}

@Composable
private fun App(vm: MainViewModel) {
    val snackbar = remember { SnackbarHostState() }
    var pendingStrip by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        vm.messages.collect { snackbar.showSnackbar(it) }
    }

    val pick = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        uri?.let(vm::open)
    }
    val create = rememberLauncherForActivityResult(CreateFile()) { uri ->
        uri?.let { vm.save(it, pendingStrip) }
    }

    when {
        vm.showOnboarding -> OnboardingScreen(onFinish = vm::finishOnboarding)
        vm.doc != null -> EditorScreen(vm, snackbar) { strip ->
            pendingStrip = strip
            val doc = vm.doc ?: return@EditorScreen
            create.launch(vm.suggestedCopyName(strip) to Formats.mimeFor(doc.ext))
        }
        else -> HomeScreen(
            onPick = { pick.launch(Formats.PICKER_TYPES) },
            onHelp = vm::replayOnboarding,
            snackbar = snackbar,
        )
    }

    vm.busy?.let { text ->
        AlertDialog(
            onDismissRequest = {},
            properties = DialogProperties(dismissOnBackPress = false, dismissOnClickOutside = false),
            confirmButton = {},
            text = {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    CircularProgressIndicator()
                    Text(text, Modifier.padding(start = 8.dp))
                }
            },
        )
    }
}
