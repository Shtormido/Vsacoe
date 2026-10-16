package com.vsacoe.metadata.core

import java.io.File
import java.nio.file.Files

object TestFiles {
    private val tmp: File by lazy { Files.createTempDirectory("meta-test").toFile().apply { deleteOnExit() } }

    fun fixture(name: String): File {
        val stream = TestFiles::class.java.getResourceAsStream("/fixtures/$name") ?: error("missing fixture $name")
        val f = File(tmp, "${System.nanoTime()}_$name")
        stream.use { input -> f.outputStream().use { input.copyTo(it) } }
        return f
    }

    fun temp(ext: String): File = File(tmp, "out_${System.nanoTime()}.$ext")

    fun List<MetaField>.value(key: String): String = first { it.key == key }.value
}
