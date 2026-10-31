import re, glob, json, sys
SP = {"D":"DIMA","L":"LEHA","EV":"EVD","LA":"LAPTEV","AL":"ALESHA","PR":"PREACHER","CH":"CHOIR","VO":"VOICE","PH":"PHONE",
      '"ARCH"':"ARCH",'"WOMAN"':"WOMAN",'"DIMA"':"DIMA",'"LEHA"':"LEHA"}
pat = re.compile(r'(?:\{\s*|say\(\s*|Dialog\.push\(\s*)(D|L|EV|LA|AL|PR|CH|VO|PH|"ARCH"|"WOMAN"|"DIMA"|"LEHA")\s*,\s*"((?:[^"\\]|\\.)*)"')
lines = {}
for f in sorted(glob.glob(sys.argv[1] + '/src/scenes/*.lua')):
    for m in pat.finditer(open(f, encoding='utf8').read()):
        sp, txt = SP[m.group(1)], m.group(2)
        lines[(sp, txt)] = 1
out = [{"sp": a, "text": b} for (a, b) in lines]
json.dump(out, open(sys.argv[2], 'w', encoding='utf8'), ensure_ascii=False, indent=0)
from collections import Counter
print(len(out), Counter(x["sp"] for x in out))
print(sum(len(x["text"]) for x in out), "символов")
