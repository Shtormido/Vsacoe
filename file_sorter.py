"""
File Sorter — раскладывает файлы выбранной папки по подпапкам по расширению.

  program.exe  -> exe\\program.exe
  photo.JPG    -> jpg\\photo.JPG
  README       -> без_расширения\\README

Режимы:
  * только выбранная папка (вложенные папки не трогаются);
  * выбранная папка вместе со всеми вложенными папками.
"""

import os
import queue
import shutil
import sys
import threading
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

NO_EXT_FOLDER = "без_расширения"
APP_TITLE = "File Sorter — сортировка файлов по типу"


# ---------------------------------------------------------------- логика ---

def own_paths():
    """Пути самой программы, чтобы не переместить её саму."""
    paths = {os.path.abspath(__file__)}
    if getattr(sys, "frozen", False):
        paths.add(os.path.abspath(sys.executable))
    return {os.path.normcase(p) for p in paths}


def folder_for(filename):
    """Имя папки назначения для файла: расширение в нижнем регистре."""
    ext = os.path.splitext(filename)[1].lower().lstrip(".")
    return ext if ext else NO_EXT_FOLDER


def collect_files(root, recursive):
    """Список файлов для сортировки."""
    skip = own_paths()
    files = []
    if recursive:
        for dirpath, _dirnames, filenames in os.walk(root):
            for name in filenames:
                files.append(os.path.join(dirpath, name))
    else:
        with os.scandir(root) as it:
            for entry in it:
                if entry.is_file(follow_symlinks=False):
                    files.append(entry.path)
    return [f for f in files if os.path.normcase(os.path.abspath(f)) not in skip]


def unique_path(path):
    """Если файл уже существует — добавляет (1), (2), ... к имени."""
    if not os.path.exists(path):
        return path
    base, ext = os.path.splitext(path)
    i = 1
    while os.path.exists(f"{base} ({i}){ext}"):
        i += 1
    return f"{base} ({i}){ext}"


def sort_file(root, src):
    """Перемещает один файл. Возвращает путь назначения или None, если файл уже на месте."""
    dest_dir = os.path.join(root, folder_for(os.path.basename(src)))
    if os.path.normcase(os.path.abspath(os.path.dirname(src))) == os.path.normcase(os.path.abspath(dest_dir)):
        return None
    os.makedirs(dest_dir, exist_ok=True)
    dest = unique_path(os.path.join(dest_dir, os.path.basename(src)))
    shutil.move(src, dest)
    return dest


def remove_empty_dirs(root):
    """Удаляет пустые вложенные папки (саму root не трогает). Возвращает их количество."""
    removed = 0
    for dirpath, _dirnames, _filenames in os.walk(root, topdown=False):
        if os.path.abspath(dirpath) == os.path.abspath(root):
            continue
        try:
            os.rmdir(dirpath)
            removed += 1
        except OSError:
            pass
    return removed


# ------------------------------------------------------------------- GUI ---

class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title(APP_TITLE)
        self.geometry("720x520")
        self.minsize(560, 400)

        self.dir_var = tk.StringVar()
        self.mode_var = tk.StringVar(value="top")
        self.clean_var = tk.BooleanVar(value=True)
        self.events = queue.Queue()
        self.history = []  # [(откуда, куда)] последней сортировки — для отмены
        self.worker = None

        self._build_ui()
        self.after(100, self._poll_events)

    def _build_ui(self):
        pad = {"padx": 10, "pady": 5}

        frm_dir = ttk.LabelFrame(self, text="Папка")
        frm_dir.pack(fill="x", **pad)
        ttk.Entry(frm_dir, textvariable=self.dir_var).pack(side="left", fill="x", expand=True, padx=5, pady=5)
        ttk.Button(frm_dir, text="Обзор…", command=self.choose_dir).pack(side="left", padx=5, pady=5)

        frm_mode = ttk.LabelFrame(self, text="Где искать файлы")
        frm_mode.pack(fill="x", **pad)
        ttk.Radiobutton(frm_mode, text="Только в выбранной папке (вложенные папки игнорируются)",
                        variable=self.mode_var, value="top",
                        command=self._update_clean_state).pack(anchor="w", padx=5)
        ttk.Radiobutton(frm_mode, text="В выбранной папке и во всех вложенных папках",
                        variable=self.mode_var, value="recursive",
                        command=self._update_clean_state).pack(anchor="w", padx=5)
        self.chk_clean = ttk.Checkbutton(frm_mode, text="Удалить опустевшие папки после сортировки",
                                         variable=self.clean_var)
        self.chk_clean.pack(anchor="w", padx=25, pady=(0, 5))
        self._update_clean_state()

        frm_btn = ttk.Frame(self)
        frm_btn.pack(fill="x", **pad)
        self.btn_sort = ttk.Button(frm_btn, text="Сортировать", command=self.start_sort)
        self.btn_sort.pack(side="left")
        self.btn_undo = ttk.Button(frm_btn, text="Отменить последнюю сортировку",
                                   command=self.undo, state="disabled")
        self.btn_undo.pack(side="left", padx=10)

        self.progress = ttk.Progressbar(self, mode="determinate")
        self.progress.pack(fill="x", **pad)

        frm_log = ttk.LabelFrame(self, text="Журнал")
        frm_log.pack(fill="both", expand=True, **pad)
        self.log = tk.Text(frm_log, height=10, wrap="none", state="disabled")
        scroll = ttk.Scrollbar(frm_log, command=self.log.yview)
        self.log.configure(yscrollcommand=scroll.set)
        scroll.pack(side="right", fill="y")
        self.log.pack(fill="both", expand=True)

    def _update_clean_state(self):
        self.chk_clean.configure(state="normal" if self.mode_var.get() == "recursive" else "disabled")

    def choose_dir(self):
        path = filedialog.askdirectory(title="Выберите папку для сортировки")
        if path:
            self.dir_var.set(os.path.normpath(path))

    def write_log(self, text):
        self.log.configure(state="normal")
        self.log.insert("end", text + "\n")
        self.log.see("end")
        self.log.configure(state="disabled")

    def set_busy(self, busy):
        self.btn_sort.configure(state="disabled" if busy else "normal")
        self.btn_undo.configure(state="disabled" if busy or not self.history else "normal")

    # --- сортировка ---

    def start_sort(self):
        root = self.dir_var.get().strip()
        if not root or not os.path.isdir(root):
            messagebox.showerror(APP_TITLE, "Выберите существующую папку.")
            return
        recursive = self.mode_var.get() == "recursive"
        where = "в папке и всех вложенных папках" if recursive else "только в самой папке"
        if not messagebox.askyesno(APP_TITLE, f"Отсортировать файлы {where}?\n\n{root}"):
            return

        self.history = []
        self.set_busy(True)
        self.write_log(f"=== Сортировка: {root} ({where}) ===")
        args = (root, recursive, recursive and self.clean_var.get())
        self.worker = threading.Thread(target=self._sort_worker, args=args, daemon=True)
        self.worker.start()

    def _sort_worker(self, root, recursive, clean):
        try:
            files = collect_files(root, recursive)
        except OSError as e:
            self.events.put(("log", f"Ошибка чтения папки: {e}"))
            self.events.put(("done", None))
            return

        self.events.put(("total", len(files)))
        moved = skipped = errors = 0
        for i, src in enumerate(files, 1):
            try:
                dest = sort_file(root, src)
                if dest is None:
                    skipped += 1
                else:
                    moved += 1
                    self.history.append((src, dest))
                    self.events.put(("log", f"{os.path.relpath(src, root)}  ->  {os.path.relpath(dest, root)}"))
            except OSError as e:
                errors += 1
                self.events.put(("log", f"ОШИБКА: {src}: {e}"))
            self.events.put(("progress", i))

        summary = f"Готово. Перемещено: {moved}, уже на месте: {skipped}, ошибок: {errors}."
        if clean:
            summary += f" Удалено пустых папок: {remove_empty_dirs(root)}."
        self.events.put(("log", summary))
        self.events.put(("done", summary))

    # --- отмена ---

    def undo(self):
        if not self.history:
            return
        if not messagebox.askyesno(APP_TITLE, f"Вернуть {len(self.history)} файл(ов) на прежние места?"):
            return
        history, self.history = self.history, []
        self.set_busy(True)
        self.write_log("=== Отмена последней сортировки ===")
        self.worker = threading.Thread(target=self._undo_worker, args=(history,), daemon=True)
        self.worker.start()

    def _undo_worker(self, history):
        self.events.put(("total", len(history)))
        restored = errors = 0
        dest_dirs = set()
        for i, (src, dest) in enumerate(reversed(history), 1):
            try:
                os.makedirs(os.path.dirname(src), exist_ok=True)
                shutil.move(dest, unique_path(src))
                dest_dirs.add(os.path.dirname(dest))
                restored += 1
            except OSError as e:
                errors += 1
                self.events.put(("log", f"ОШИБКА: {dest}: {e}"))
            self.events.put(("progress", i))
        for d in dest_dirs:  # убираем созданные программой папки, если они пусты
            try:
                os.rmdir(d)
            except OSError:
                pass
        summary = f"Отмена завершена. Возвращено: {restored}, ошибок: {errors}."
        self.events.put(("log", summary))
        self.events.put(("done", summary))

    # --- связь потока с интерфейсом ---

    def _poll_events(self):
        try:
            while True:
                kind, value = self.events.get_nowait()
                if kind == "log":
                    self.write_log(value)
                elif kind == "total":
                    self.progress.configure(maximum=max(value, 1), value=0)
                elif kind == "progress":
                    self.progress.configure(value=value)
                elif kind == "done":
                    self.set_busy(False)
                    if value:
                        messagebox.showinfo(APP_TITLE, value)
        except queue.Empty:
            pass
        self.after(100, self._poll_events)


if __name__ == "__main__":
    App().mainloop()
