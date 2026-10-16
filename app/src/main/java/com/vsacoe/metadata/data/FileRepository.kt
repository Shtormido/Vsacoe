package com.vsacoe.metadata.data

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import com.vsacoe.metadata.core.MetadataException
import java.io.File
import java.io.FileNotFoundException

/** Copies files between the Storage Access Framework and the app cache. */
class FileRepository(private val context: Context) {

    data class Info(val name: String, val size: Long, val mime: String?)

    private val workDir: File get() = File(context.cacheDir, "work").apply { mkdirs() }

    fun info(uri: Uri): Info {
        var name: String? = null
        var size = -1L
        runCatching {
            context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { c ->
                if (c.moveToFirst()) {
                    val ni = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    val si = c.getColumnIndex(OpenableColumns.SIZE)
                    if (ni >= 0) name = c.getString(ni)
                    if (si >= 0 && !c.isNull(si)) size = c.getLong(si)
                }
            }
        }
        val fallback = uri.lastPathSegment?.substringAfterLast('/') ?: "file"
        return Info(name ?: fallback, size, context.contentResolver.getType(uri))
    }

    /** Clears old working copies. */
    fun cleanWorkDir() {
        workDir.listFiles()?.forEach { it.delete() }
    }

    fun newWorkFile(ext: String): File = File.createTempFile("meta_", ".$ext", workDir)

    fun copyToWork(uri: Uri, ext: String): File {
        val f = newWorkFile(ext)
        try {
            context.contentResolver.openInputStream(uri)?.use { input ->
                f.outputStream().use { input.copyTo(it, 256 * 1024) }
            } ?: throw MetadataException("Не удалось открыть файл")
        } catch (e: SecurityException) {
            throw MetadataException("Нет доступа к файлу", e)
        } catch (e: FileNotFoundException) {
            throw MetadataException("Файл не найден", e)
        }
        return f
    }

    /** Writes [file] over the content at [uri]. */
    fun writeTo(uri: Uri, file: File) {
        try {
            val out = try {
                context.contentResolver.openOutputStream(uri, "wt")
            } catch (e: IllegalArgumentException) {
                context.contentResolver.openOutputStream(uri, "w")
            } catch (e: FileNotFoundException) {
                context.contentResolver.openOutputStream(uri, "w")
            } ?: throw MetadataException("Не удалось открыть файл для записи")
            out.use { o -> file.inputStream().use { it.copyTo(o, 256 * 1024) } }
        } catch (e: MetadataException) {
            throw e
        } catch (e: SecurityException) {
            throw MetadataException("Нет прав на изменение этого файла. Используйте «Сохранить копию».", e)
        } catch (e: FileNotFoundException) {
            throw MetadataException("Нет прав на изменение этого файла. Используйте «Сохранить копию».", e)
        } catch (e: UnsupportedOperationException) {
            throw MetadataException("Источник не позволяет перезаписывать файл. Используйте «Сохранить копию».", e)
        }
    }
}
