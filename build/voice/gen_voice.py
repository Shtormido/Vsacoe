# Озвучка реплик: Piper (русские голоса) + обработка ffmpeg под персонажа
import json, hashlib, os, sys, wave, subprocess, re
from piper import PiperVoice, SynthesisConfig

S = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
lines = json.load(open(os.path.join(S, "lines.json"), encoding="utf8"))
V = {n: PiperVoice.load(os.path.join(S, "voices", f"ru_RU-{n}-medium.onnx")) for n in ["dmitri", "denis", "ruslan", "irina"]}

def pitch(semi):
    # сдвиг высоты без изменения темпа (базовая частота Piper medium = 22050)
    k = 2 ** (semi / 12)
    return f"asetrate=22050*{k:.4f},aresample=22050,atempo={1 / k:.4f}"

# голос, length_scale, цепочка фильтров ffmpeg
PROFILE = {
    "DIMA":     ("dmitri", 1.04, [pitch(-0.7), "aecho=0.8:0.5:60:0.12"]),
    "LEHA":     ("denis",  0.93, [pitch(1.0), "aecho=0.8:0.5:60:0.12"]),
    "EVD":      ("irina",  1.25, [pitch(-1.5), "aecho=0.8:0.7:180|340:0.35|0.22", "lowpass=f=5200"]),
    "ALESHA":   ("irina",  1.12, [pitch(5.5), "aecho=0.8:0.7:150|300:0.3|0.2"]),
    "LAPTEV":   ("ruslan", 1.15, [pitch(-1.2), "aecho=0.8:0.7:200|400:0.35|0.2", "lowpass=f=4200"]),
    "PHONE":    ("ruslan", 1.12, [pitch(-1.2), "highpass=f=450", "lowpass=f=3000", "acrusher=bits=9:mix=0.35", "volume=1.6"]),
    "PREACHER": ("denis",  1.25, [pitch(-6.0), "aecho=0.8:0.8:250|520:0.45|0.3", "lowpass=f=3800"]),
    "VOICE":    ("denis",  1.05, [pitch(0.5), "aecho=0.8:0.8:300|620:0.5|0.35", "lowpass=f=2800", "volume=0.8"]),
    "ARCH":     ("ruslan", 1.0,  [pitch(-2.0)]),
    "WOMAN":    ("irina",  1.2,  [pitch(-2.5), "vibrato=f=5:d=0.25"]),
}

def clean(t):
    t = t.replace("«", "").replace("»", "").replace("—", ",").replace("…", "...")
    t = re.sub(r"\s+", " ", t).strip()
    return t

def key(sp, text):
    return hashlib.md5((sp + "|" + text).encode("utf8")).hexdigest()

def synth(voice, text, ls, path):
    with wave.open(path, "wb") as w:
        V[voice].synthesize_wav(text, w, SynthesisConfig(length_scale=ls, noise_scale=0.6, noise_w_scale=0.8))

def ff(inputs, filt, out):
    cmd = ["ffmpeg", "-y", "-loglevel", "error"]
    for i in inputs: cmd += ["-i", i]
    cmd += ["-filter_complex", filt, "-ac", "1", "-ar", "22050", "-c:a", "libvorbis", "-q:a", "2", out]
    subprocess.run(cmd, check=True)

tmp = os.path.join(S, "tmpwav")
os.makedirs(tmp, exist_ok=True)
manifest = {}
for n, ln in enumerate(lines):
    sp, text = ln["sp"], ln["text"]
    k = key(sp, text)
    out = os.path.join(OUT, k + ".ogg")
    manifest[k] = sp
    if os.path.exists(out):
        continue
    t = clean(text)
    if sp == "CHOIR":
        # хор: несколько голосов разной высоты поверх друг друга, через Лёху
        parts = [("denis", 1.2, -3.0), ("dmitri", 1.22, -7.0), ("irina", 1.18, -2.0), ("ruslan", 1.24, -5.0)]
        ins = []
        for i, (v, ls, semi) in enumerate(parts):
            p = os.path.join(tmp, f"c{i}.wav")
            synth(v, t, ls, p)
            ins.append(p)
        chains = ";".join(f"[{i}:a]{pitch(parts[i][2])},adelay={i * 35}|{i * 35}[a{i}]" for i in range(len(ins)))
        mix = "".join(f"[a{i}]" for i in range(len(ins)))
        ff(ins, f"{chains};{mix}amix=inputs={len(ins)}:normalize=0,aecho=0.8:0.8:240|480:0.4|0.25,lowpass=f=4500,volume=0.9", out)
    else:
        v, ls, chain = PROFILE[sp]
        p = os.path.join(tmp, "x.wav")
        synth(v, t, ls, p)
        ff([p], "[0:a]" + ",".join(chain) + ",apad=pad_dur=0.15", out)
    if n % 25 == 0:
        print(n, "/", len(lines), flush=True)
json.dump(manifest, open(os.path.join(OUT, "_list.json"), "w"), indent=0)
print("готово", len(manifest))
