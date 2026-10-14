"""Собирает все модели игры и картинки интерфейса.

Запуск: python3 blender/build_all.py — нужен Blender как модуль Python (pip install bpy)
или: blender --background --python blender/build_all.py
"""
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
STEPS = [
    ("pets.py", "собаки и кошка"),
    ("salon.py", "мебель салона и сцена чемпионата"),
    ("tools.py", "инструменты грумера"),
    ("people.py", "персонажи"),
    ("player.py", "конструктор персонажа игрока"),
    ("renders.py", "иконки и портреты"),
]


def main():
    try:
        import bpy  # noqa: F401
        runner = [sys.executable]
    except ImportError:
        runner = ["blender", "--background", "--factory-startup", "--python-exit-code", "1", "--python"]
    for script, title in STEPS:
        print(f"== {title} ({script})", flush=True)
        cmd = runner + [os.path.join(HERE, script)]
        r = subprocess.run(cmd, cwd=HERE)
        if r.returncode != 0:
            sys.exit(f"Ошибка на шаге {script}")
    print("Готово: public/models, public/icons, public/portraits")


if __name__ == "__main__":
    main()
