package com.vsacoe.metadata.ui

import android.app.Application
import android.net.Uri
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.vsacoe.metadata.core.FieldValidator
import com.vsacoe.metadata.core.MetaField
import com.vsacoe.metadata.core.MetadataException
import com.vsacoe.metadata.core.MetadataHandler
import com.vsacoe.metadata.data.FileRepository
import com.vsacoe.metadata.data.Formats
import com.vsacoe.metadata.data.Prefs
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

data class OpenedDoc(
    val uri: Uri,
    val name: String,
    val size: Long,
    val ext: String,
    val handler: MetadataHandler,
    val work: File,
    val fields: List<MetaField>,
) {
    val formatName: String get() = handler.formatName(ext)
    val writable: Boolean get() = Formats.isWritable(ext)
    val mime: String get() = Formats.mimeFor(ext)
}

class MainViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = FileRepository(app)
    private val prefs = Prefs(app)

    var showOnboarding by mutableStateOf(!prefs.onboardingDone)
        private set
    var showEditorTip by mutableStateOf(!prefs.editorTipDone)
        private set

    /** Non-null while a long operation runs; the text is shown to the user. */
    var busy by mutableStateOf<String?>(null)
        private set

    var doc by mutableStateOf<OpenedDoc?>(null)
        private set

    /** Values typed by the user that differ from the file. */
    val edits = mutableStateMapOf<String, String>()

    private val messageChannel = Channel<String>(Channel.BUFFERED)
    val messages = messageChannel.receiveAsFlow()

    val hasChanges: Boolean get() = edits.isNotEmpty()

    fun finishOnboarding() {
        prefs.onboardingDone = true
        showOnboarding = false
    }

    fun replayOnboarding() {
        showOnboarding = true
    }

    fun dismissEditorTip() {
        prefs.editorTipDone = true
        showEditorTip = false
    }

    fun valueOf(field: MetaField): String = edits[field.key] ?: field.value

    fun setValue(field: MetaField, value: String) {
        if (value == field.value) edits.remove(field.key) else edits[field.key] = value
    }

    fun errorOf(field: MetaField): String? = edits[field.key]?.let { FieldValidator.validate(field, it) }

    fun discardEdits() = edits.clear()

    fun close() {
        doc = null
        edits.clear()
    }

    fun open(uri: Uri) = runBusy("Чтение файла…") {
        val info = repo.info(uri)
        val ext = Formats.extensionOf(info.name, info.mime)
        val handler = Formats.handlerFor(ext)
            ?: throw MetadataException("Формат «${ext.ifEmpty { "?" }}» не поддерживается. Выберите документ Office, фото или видео.")
        repo.cleanWorkDir()
        val work = repo.copyToWork(uri, ext)
        val fields = handler.read(work)
        val opened = OpenedDoc(uri, info.name, if (info.size >= 0) info.size else work.length(), ext, handler, work, fields)
        withContext(Dispatchers.Main) {
            edits.clear()
            doc = opened
        }
    }

    /**
     * Applies the edits (or removes all metadata when [strip] is true) and writes the
     * result to [target], or over the original file when [target] is null.
     */
    fun save(target: Uri?, strip: Boolean) {
        val d = doc ?: return
        val values = HashMap(edits.toMap())
        if (!strip) {
            val bad = d.fields.firstOrNull { f -> values[f.key]?.let { FieldValidator.validate(f, it) } != null }
            if (bad != null) {
                messageChannel.trySend("Исправьте поле «${bad.label}»")
                return
            }
            if (values.isEmpty() && target == null) {
                messageChannel.trySend("Нет изменений")
                return
            }
            // Coordinates are written as a pair.
            if (LINKED.any { it in values }) LINKED.forEach { k ->
                d.fields.firstOrNull { it.key == k }?.let { f -> values.putIfAbsent(k, f.value) }
            }
        }
        runBusy(if (strip) "Удаление метаданных…" else "Сохранение…") {
            val out = repo.newWorkFile(d.ext)
            if (strip) d.handler.stripAll(d.work, out) else d.handler.write(d.work, out, values)
            repo.writeTo(target ?: d.uri, out)
            val fields = d.handler.read(out)
            val newDoc = if (target == null) {
                d.copy(work = out, fields = fields, size = out.length())
            } else {
                val info = repo.info(target)
                d.copy(uri = target, name = info.name, work = out, fields = fields, size = out.length())
            }
            d.work.takeIf { it != out }?.delete()
            withContext(Dispatchers.Main) {
                edits.clear()
                doc = newDoc
            }
            messageChannel.send(
                when {
                    strip && target == null -> "Все метаданные удалены"
                    strip -> "Сохранена чистая копия: ${newDoc.name}"
                    target == null -> "Изменения сохранены"
                    else -> "Сохранена копия: ${newDoc.name}"
                },
            )
        }
    }

    fun suggestedCopyName(strip: Boolean): String {
        val d = doc ?: return "file"
        val base = d.name.substringBeforeLast('.', d.name)
        return "${base}_${if (strip) "clean" else "edited"}.${d.ext}"
    }

    private fun runBusy(text: String, block: suspend () -> Unit) {
        if (busy != null) return
        busy = text
        viewModelScope.launch(Dispatchers.IO) {
            try {
                block()
            } catch (e: MetadataException) {
                messageChannel.send(e.message ?: "Ошибка")
            } catch (e: OutOfMemoryError) {
                messageChannel.send("Файл слишком большой для обработки")
            } catch (e: Exception) {
                messageChannel.send("Ошибка: ${e.message ?: e.javaClass.simpleName}")
            } finally {
                withContext(Dispatchers.Main) { busy = null }
            }
        }
    }

    companion object {
        private val LINKED = listOf("latitude", "longitude")
    }
}
