using System;
using System.Collections.Generic;
using System.IO;

namespace JivieOboi;

/// <summary>
/// Встроенные веб-обои: шейдеры WebGL, написанные для этой программы (без Steam и Wallpaper Engine).
/// При запуске HTML-файлы раскладываются в %LocalAppData%\JivieOboi\builtin-web и показываются
/// движком WebView2 как обычные веб-обои — с настройками и реакцией на музыку.
/// </summary>
internal static class BuiltInWeb
{
    public sealed record Entry(string Id, string Title, string DefaultColor, string Shader);

    public static readonly Entry[] All =
    {
        new("ink", "Жидкие краски", "0.15 0.45 1", Ink),
        new("synthwave", "Ретровейв", "1 0.2 0.8", Synthwave),
        new("warp", "Звёздный полёт", "0.5 0.75 1", Warp),
        new("plasma", "Плазма", "0.6 0.2 1", Plasma),
    };

    public static string Folder => Path.Combine(Settings.Dir, "builtin-web");

    /// <summary>Разложить HTML-файлы (перезаписываются, если программа обновилась).</summary>
    public static string PathFor(Entry e)
    {
        var dir = Path.Combine(Folder, e.Id);
        var file = Path.Combine(dir, "index.html");
        var html = Page(e);
        try
        {
            Directory.CreateDirectory(dir);
            if (!File.Exists(file) || File.ReadAllText(file) != html) File.WriteAllText(file, html);
        }
        catch (Exception ex)
        {
            Log.Error("Встроенные веб-обои " + e.Id, ex);
        }
        return file;
    }

    public static List<PropertyDef> Properties(Entry e) => new()
    {
        new PropertyDef { Key = "speed", Type = "slider", Text = "Скорость", Min = 0.1, Max = 3, Step = 0.05, Default = "1", Order = 0 },
        new PropertyDef { Key = "color", Type = "color", Text = "Цвет", Default = e.DefaultColor, Order = 1 },
        new PropertyDef
        {
            Key = "quality", Type = "combo", Text = "Качество (больше — красивее, но тяжелее для видеокарты)", Default = "0.6", Order = 2,
            NumericOptions = true,
            Options = new() { new() { Label = "Низкое", Value = "0.4" }, new() { Label = "Среднее", Value = "0.6" }, new() { Label = "Высокое", Value = "0.85" }, new() { Label = "Максимальное", Value = "1" } },
        },
        new PropertyDef { Key = "audio", Type = "bool", Text = "Реагировать на музыку", Default = "true", Order = 3 },
        new PropertyDef { Key = "mouse", Type = "bool", Text = "Реагировать на мышь", Default = "true", Order = 4 },
    };

    static string Page(Entry e) => Template.Replace("/*FRAGMENT*/", e.Shader).Replace("/*TITLE*/", e.Title).Replace("/*COLOR*/", e.DefaultColor);

    // Общая обвязка: WebGL, равномерное время со скоростью, мышь, басы, ограничение FPS, пауза, API Wallpaper Engine.
    const string Template = """
        <!doctype html>
        <html><head><meta charset="utf-8"><title>/*TITLE*/</title>
        <style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#000}canvas{width:100%;height:100%;display:block}</style>
        </head><body><canvas id="c"></canvas>
        <script>
        (() => {
          const FRAG = `
        precision highp float;
        uniform vec2 R; uniform float T; uniform vec2 M; uniform float B; uniform vec3 C;
        /*FRAGMENT*/
        `;
          const canvas = document.getElementById('c');
          const gl = canvas.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'low-power' });
          if (!gl) { document.body.style.background = '#102'; return; }
          const compile = (type, src) => {
            const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
            return s;
          };
          const prog = gl.createProgram();
          gl.attachShader(prog, compile(gl.VERTEX_SHADER, 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}'));
          gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
          gl.linkProgram(prog);
          if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
          gl.useProgram(prog);
          gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
          const loc = gl.getAttribLocation(prog, 'p');
          gl.enableVertexAttribArray(loc);
          gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
          const u = n => gl.getUniformLocation(prog, n);
          const uR = u('R'), uT = u('T'), uM = u('M'), uB = u('B'), uC = u('C');

          let speed = 1, color = '/*COLOR*/'.split(' ').map(Number), quality = 0.6, fps = 30;
          let useAudio = true, useMouse = true, paused = false;
          let time = 0, last = performance.now(), lastDraw = 0, bass = 0, bassTarget = 0;
          let mouse = [0.5, 0.5], mouseSmooth = [0.5, 0.5];

          const resize = () => {
            const k = (window.devicePixelRatio || 1) * quality;
            canvas.width = Math.max(1, Math.round(innerWidth * k));
            canvas.height = Math.max(1, Math.round(innerHeight * k));
            gl.viewport(0, 0, canvas.width, canvas.height);
          };
          addEventListener('resize', resize);
          resize();

          window.wallpaperPropertyListener = {
            applyUserProperties(p) {
              if (p.speed) speed = Number(p.speed.value);
              if (p.color) color = String(p.color.value).split(' ').map(Number);
              if (p.quality) { quality = Number(p.quality.value) || 0.6; resize(); }
              if (p.audio) useAudio = !!p.audio.value;
              if (p.mouse) useMouse = !!p.mouse.value;
            },
            applyGeneralProperties(g) { if (g.fps) fps = g.fps; },
            setPaused(v) { paused = !!v; last = performance.now(); }
          };
          if (window.wallpaperRegisterAudioListener) {
            window.wallpaperRegisterAudioListener(a => {
              let s = 0;
              for (let i = 0; i < 8; i++) s += a[i] + a[64 + i];
              bassTarget = s / 16;
            });
          }
          addEventListener('mousemove', e => { mouse = [e.clientX / innerWidth, 1 - e.clientY / innerHeight]; });

          const frame = now => {
            requestAnimationFrame(frame);
            if (paused || now - lastDraw < 1000 / fps - 2) return;
            lastDraw = now;
            const dt = Math.min(0.1, (now - last) / 1000);
            last = now;
            time += dt * speed;
            bass += ((useAudio ? bassTarget : 0) - bass) * Math.min(1, dt * 10);
            bassTarget *= 0.92;
            const m = useMouse ? mouse : [0.5, 0.5];
            mouseSmooth = [mouseSmooth[0] + (m[0] - mouseSmooth[0]) * 0.08, mouseSmooth[1] + (m[1] - mouseSmooth[1]) * 0.08];
            gl.uniform2f(uR, canvas.width, canvas.height);
            gl.uniform1f(uT, time);
            gl.uniform2f(uM, mouseSmooth[0], mouseSmooth[1]);
            gl.uniform1f(uB, Math.min(1.5, bass));
            gl.uniform3f(uC, color[0] || 0, color[1] || 0, color[2] || 0);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
          };
          requestAnimationFrame(frame);
        })();
        </script></body></html>
        """;

    // ── шейдеры ──

    const string Noise = """
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        float fbm(vec2 p) {
          float v = 0.0, a = 0.5;
          mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
          for (int i = 0; i < 5; i++) { v += a * noise(p); p = m * p; a *= 0.5; }
          return v;
        }
        """;

    /// <summary>Перетекающие краски: «искривление пространства» шумом (domain warping).</summary>
    const string Ink = Noise + """
        void main() {
          vec2 uv = gl_FragCoord.xy / R.y;
          float t = T * 0.08;
          vec2 q = vec2(fbm(uv * 2.0 + t), fbm(uv * 2.0 + vec2(5.2, 1.3) - t));
          vec2 r = vec2(fbm(uv * 2.0 + 3.0 * q + vec2(1.7, 9.2) + t * 1.5 + (M - 0.5) * 0.8),
                        fbm(uv * 2.0 + 3.0 * q + vec2(8.3, 2.8) - t));
          float f = fbm(uv * 2.0 + 3.0 * r);
          vec3 col = mix(C * 0.2, C, clamp(f * f * 2.2, 0.0, 1.0));
          col = mix(col, vec3(0.95, 0.35, 0.65), clamp(length(q) * 0.55, 0.0, 1.0) * 0.55);
          col = mix(col, vec3(0.1, 0.9, 0.85), clamp(r.x * r.x, 0.0, 1.0) * 0.45);
          col *= 0.55 + 0.9 * f + B * 0.45;
          gl_FragColor = vec4(col, 1.0);
        }
        """;

    /// <summary>Ретровейв: солнце в полоску и бегущая неоновая сетка.</summary>
    const string Synthwave = Noise + """
        void main() {
          vec2 uv = (gl_FragCoord.xy - 0.5 * R) / R.y;
          uv.x += (M.x - 0.5) * 0.08;
          float horizon = -0.05;
          vec3 col;
          if (uv.y > horizon) {
            float h = uv.y - horizon;
            col = mix(vec3(0.95, 0.25, 0.55), vec3(0.06, 0.02, 0.18), clamp(h * 2.2, 0.0, 1.0));
            // звёзды
            vec2 sp = floor(gl_FragCoord.xy / 3.0);
            float star = step(0.997, hash(sp)) * clamp(h * 4.0, 0.0, 1.0);
            col += vec3(star) * (0.5 + 0.5 * sin(T * 3.0 + hash(sp + 1.0) * 6.28));
            // солнце
            vec2 sc = uv - vec2(0.0, 0.2);
            float radius = 0.24 + B * 0.025;
            float d = length(sc);
            float sun = 1.0 - smoothstep(radius - 0.004, radius, d);
            float k = 0.2 - uv.y;
            float cut = k > 0.0 ? step(k * 2.4, fract(k * 14.0 - T * 0.15)) : 1.0;
            vec3 sunCol = mix(vec3(1.0, 0.9, 0.3), vec3(1.0, 0.2, 0.55), clamp((0.44 - uv.y) * 1.6, 0.0, 1.0));
            col = mix(col, sunCol, sun * cut);
            col += C * 0.35 * exp(-d * 5.0) * (1.0 + B);
          } else {
            float z = 0.22 / (horizon - uv.y + 0.0005);
            vec2 g = vec2(uv.x * z * 1.6, z + T * 0.8);
            vec2 dist = 0.5 - abs(fract(g) - 0.5);
            float w = 0.02 * z;
            float line = max(1.0 - smoothstep(0.0, w, dist.x), 1.0 - smoothstep(0.0, w, dist.y));
            float fade = exp(-z * 0.12);
            col = vec3(0.03, 0.0, 0.07) + C * line * fade * (1.2 + B * 1.5);
            col += vec3(0.6, 0.1, 0.5) * exp(-(horizon - uv.y) * 18.0) * 0.6;
          }
          gl_FragColor = vec4(col, 1.0);
        }
        """;

    /// <summary>Полёт сквозь звёзды: слои звёзд, летящие на зрителя.</summary>
    const string Warp = Noise + """
        void main() {
          vec2 uv = (gl_FragCoord.xy - 0.5 * R) / R.y;
          uv -= (M - 0.5) * 0.15;
          vec3 col = vec3(0.0);
          float t = T * 0.35;
          for (int i = 0; i < 5; i++) {
            float fi = float(i);
            float depth = fract(t * (1.0 + B * 0.6) + fi / 5.0);
            float scale = mix(18.0, 0.6, depth);
            float fade = smoothstep(0.0, 0.4, depth) * (1.0 - smoothstep(0.85, 1.0, depth));
            vec2 p = uv * scale + fi * 23.17;
            vec2 id = floor(p);
            vec2 f = fract(p) - 0.5;
            float present = step(0.55, hash(id));
            vec2 offset = vec2(hash(id + 3.7), hash(id + 9.1)) - 0.5;
            float d = length(f - offset * 0.4);
            // Свечение гаснет к краю ячейки — иначе видны квадраты.
            float edge = max(abs(f.x), abs(f.y));
            float star = present * (exp(-d * 45.0) * 1.6 + exp(-d * 14.0) * 0.18) * (1.0 - smoothstep(0.3, 0.5, edge));
            vec3 tint = mix(vec3(1.0), C, hash(id + 5.3));
            col += tint * star * fade;
          }
          float r = length(uv);
          col += C * 0.12 * fbm(uv * 3.0 + T * 0.05) * (1.0 - r);
          col = 1.0 - exp(-col * 1.2);
          gl_FragColor = vec4(col, 1.0);
        }
        """;

    /// <summary>Классическая плазма из синусоид.</summary>
    const string Plasma = """
        void main() {
          vec2 uv = gl_FragCoord.xy / R.y;
          float t = T * 0.6;
          vec2 center = vec2(0.9 + 0.4 * sin(t * 0.3), 0.5 + 0.3 * cos(t * 0.4)) + (M - 0.5) * 0.4;
          float v = sin(uv.x * 6.0 + t)
                  + sin(uv.y * 7.0 - t * 1.3)
                  + sin((uv.x + uv.y) * 5.0 + t * 0.7)
                  + sin(length(uv - center) * 12.0 - t * 2.0);
          float wave = 0.5 + 0.5 * sin(v * 1.4);
          vec3 col = mix(C * 0.12, C, wave * wave);
          col += 0.22 * (0.5 + 0.5 * cos(v * 1.1 + vec3(0.0, 2.0, 4.0))) * wave;
          col *= 0.8 + 0.4 * B;
          gl_FragColor = vec4(col, 1.0);
        }
        """;
}
