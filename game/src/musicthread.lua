-- Генератор музыки (отдельный поток). Каждый трек — бесшовная стерео-петля
-- с ревербером; готовые SoundData отправляются в канал «music».
require("love.sound")

local out = love.thread.getChannel("music")
local SR = 22050
local sin, exp, floor, pi, pi2 = math.sin, math.exp, math.floor, math.pi, math.pi * 2
local TL = 2048
math.randomseed(1954)
local rnd = math.random

local function hz(n) return 440 * 2 ^ ((n - 69) / 12) end

-------------------------------------------------------------- волновые таблицы
local function table_(weights)
  local t = {}
  for i = 0, TL - 1 do
    local ph = i / TL * pi2
    local v = 0
    for h, w in pairs(weights) do v = v + sin(ph * h) * w end
    t[i] = v
  end
  local m = 0
  for i = 0, TL - 1 do m = math.max(m, math.abs(t[i])) end
  for i = 0, TL - 1 do t[i] = t[i] / m end
  return t
end

local W_SINE = table_({ [1] = 1 })
local W_WARM, W_SAW, W_AAH, W_PIANO, W_DULL, W_GLASS = {}, {}, {}, {}, {}, {}
do
  local w = {}
  for h = 1, 10 do w[h] = 1 / h ^ 1.6 end
  W_WARM = table_(w)
  w = {}
  for h = 1, 14 do w[h] = 1 / h end
  W_SAW = table_(w)
  w = {}
  for h = 1, 12 do
    local f = 130 * h
    w[h] = (math.exp(-((f - 700) / 260) ^ 2) + 0.7 * math.exp(-((f - 1150) / 300) ^ 2) + 0.35 / h)
  end
  W_AAH = table_(w)
  W_PIANO = table_({ [1] = 1, [2] = 0.55, [3] = 0.32, [4] = 0.2, [5] = 0.12, [6] = 0.08, [7] = 0.05 })
  W_DULL = table_({ [1] = 1, [2] = 0.25, [3] = 0.06 })
  W_GLASS = table_({ [1] = 1, [3] = 0.2, [5] = 0.06 })
end

-------------------------------------------------------------- трек
local function newTrack(sec)
  local n = floor(sec * SR)
  local L, R = {}, {}
  for i = 1, n do L[i] = 0 R[i] = 0 end
  return { L = L, R = R, n = n }
end

-- голос с огибающей; хвосты заворачиваются в начало петли
local function voice(tr, t0, dur, pan, amp, gen)
  local n = tr.n
  local s = floor(t0 * SR)
  local cnt = floor(dur * SR)
  local a = (pan + 1) * pi / 4
  local gl, gr = math.cos(a) * amp, sin(a) * amp
  local L, R = tr.L, tr.R
  for k = 0, cnt - 1 do
    local v = gen(k / SR)
    local idx = (s + k) % n + 1
    L[idx] = L[idx] + v * gl
    R[idx] = R[idx] + v * gr
  end
end

-------------------------------------------------------------- инструменты
local function osc(tab, f)
  local ph, inc = rnd(), f / SR
  return function(df)
    ph = ph + inc * (df or 1)
    ph = ph - floor(ph)
    return tab[floor(ph * TL)]
  end
end

-- фортепиано: яркая атака переходит в глухой хвост
local function piano(tr, t0, note, vel, pan, len)
  local f = hz(note)
  len = len or 4.5
  local o1, o2 = osc(W_PIANO, f), osc(W_DULL, f * 1.0015)
  voice(tr, t0, len, pan or 0, vel or 0.5, function(t)
    local env = math.min(1, t / 0.004) * exp(-t * 1.25)
    local br = exp(-t * 3.5)
    local v = o1() * br + o2() * (1 - br * 0.6)
    if t < 0.012 then v = v + (rnd() * 2 - 1) * 0.15 * (1 - t / 0.012) end
    return v * env
  end)
end

local function musicbox(tr, t0, note, vel, pan)
  local f = hz(note)
  local o1, o2, o3 = osc(W_SINE, f), osc(W_SINE, f * 2.76), osc(W_SINE, f * 5.4)
  voice(tr, t0, 3.2, pan or 0, vel or 0.4, function(t)
    local a = math.min(1, t / 0.002)
    return a * (o1() * exp(-t * 1.6) + o2() * 0.35 * exp(-t * 4) + o3() * 0.15 * exp(-t * 9))
  end)
end

local function pad(tr, t0, dur, note, vel, pan, tab)
  local f = hz(note)
  tab = tab or W_WARM
  local o1, o2, o3 = osc(tab, f * 0.997), osc(tab, f * 1.003), osc(W_SINE, f * 0.5)
  local att, rel = math.min(2.5, dur * 0.4), math.min(3, dur * 0.5)
  voice(tr, t0, dur + rel, pan or 0, vel or 0.2, function(t)
    local env = math.min(1, t / att)
    if t > dur then env = env * math.max(0, 1 - (t - dur) / rel) end
    local lfo = 1 + 0.002 * sin(t * 2.1)
    return (o1(lfo) + o2() + o3() * 0.4) * env
  end)
end

local function strings(tr, t0, dur, note, vel, pan)
  local f = hz(note)
  local o1, o2 = osc(W_SAW, f), osc(W_WARM, f * 1.004)
  local att, rel = math.min(1.8, dur * 0.5), 1.5
  voice(tr, t0, dur + rel, pan or 0, vel or 0.15, function(t)
    local env = math.min(1, t / att)
    if t > dur then env = env * math.max(0, 1 - (t - dur) / rel) end
    local vib = 1 + 0.004 * sin(t * pi2 * 5.2) * math.min(1, t)
    return (o1(vib) * 0.55 + o2(vib)) * env
  end)
end

local function choir(tr, t0, dur, note, vel, pan)
  local f = hz(note)
  local o1, o2, o3 = osc(W_AAH, f * 0.996), osc(W_AAH, f), osc(W_AAH, f * 1.005)
  local att, rel = math.min(2, dur * 0.4), 2.2
  voice(tr, t0, dur + rel, pan or 0, vel or 0.15, function(t)
    local env = math.min(1, t / att)
    if t > dur then env = env * math.max(0, 1 - (t - dur) / rel) end
    local vib = 1 + 0.005 * sin(t * pi2 * 4.8)
    return (o1(vib) + o2() + o3(2 - vib)) * env
  end)
end

local function bass(tr, t0, dur, note, vel)
  local f = hz(note)
  local o = osc(W_DULL, f)
  voice(tr, t0, dur + 1, 0, vel or 0.3, function(t)
    local env = math.min(1, t / 0.6)
    if t > dur then env = env * math.max(0, 1 - (t - dur)) end
    return o() * env
  end)
end

local function heartbeat(tr, t0, vel)
  for _, d in ipairs({ 0, 0.28 }) do
    voice(tr, t0 + d, 0.4, 0, (vel or 0.5) * (d == 0 and 1 or 0.7), function(t)
      return sin(pi2 * (55 - t * 40) * t) * exp(-t * 14)
    end)
  end
end

local function glass(tr, t0, dur, note, vel, pan)
  local f = hz(note)
  local o = osc(W_GLASS, f)
  voice(tr, t0, dur, pan or 0, vel or 0.06, function(t)
    local env = sin(math.min(1, t / dur) * pi)
    return o(1 + 0.003 * sin(t * 7)) * env
  end)
end

local function bell(tr, t0, note, vel, pan)
  local f = hz(note)
  local parts = { { 0.5, 0.4, 0.5 }, { 1, 1, 0.8 }, { 1.19, 0.4, 1.1 }, { 1.56, 0.3, 1.4 }, { 2, 0.3, 1.7 }, { 2.74, 0.2, 2.3 } }
  local os_ = {}
  for i, p in ipairs(parts) do os_[i] = osc(W_SINE, f * p[1]) end
  voice(tr, t0, 6, pan or 0, vel or 0.3, function(t)
    local v = 0
    for i, p in ipairs(parts) do v = v + os_[i]() * p[2] * exp(-t * p[3]) end
    return v * math.min(1, t / 0.002)
  end)
end

local function wind(tr, vel)
  local y, y2 = 0, 0
  local L, R = tr.L, tr.R
  for i = 1, tr.n do
    local t = i / SR
    local a = 0.01 + 0.02 * (0.5 + 0.5 * sin(t * 0.7))
    y = y + a * ((rnd() * 2 - 1) - y)
    y2 = y2 + 0.3 * (y - y2)
    L[i] = L[i] + y2 * vel * 4
    R[i] = R[i] + y * vel * 4
  end
end

-------------------------------------------------------------- ревербератор (Freeverb-подобный), два прохода для бесшовной петли
local function reverb(tr, mix, size)
  size = size or 0.84
  local function proc(buf, offs)
    local combs = {}
    for k, d in ipairs({ 558, 594, 638, 678 }) do combs[k] = { b = {}, i = 0, n = d + offs, f = 0 } end
    local aps = {}
    for k, d in ipairs({ 278, 220 }) do aps[k] = { b = {}, i = 0, n = d + offs } end
    for _, c in ipairs(combs) do for j = 0, c.n - 1 do c.b[j] = 0 end end
    for _, a in ipairs(aps) do for j = 0, a.n - 1 do a.b[j] = 0 end end
    local n = #buf
    local wet = {}
    for pass = 1, 2 do
      for i = 1, n do
        local x = buf[i] * 0.3
        local s = 0
        for k = 1, 4 do
          local c = combs[k]
          local y = c.b[c.i]
          c.f = y * 0.75 + c.f * 0.25
          c.b[c.i] = x + c.f * size
          c.i = c.i + 1
          if c.i >= c.n then c.i = 0 end
          s = s + y
        end
        for k = 1, 2 do
          local a = aps[k]
          local bv = a.b[a.i]
          local y = -s + bv
          a.b[a.i] = s + bv * 0.5
          a.i = a.i + 1
          if a.i >= a.n then a.i = 0 end
          s = y
        end
        if pass == 2 then wet[i] = s end
      end
    end
    for i = 1, n do buf[i] = buf[i] + wet[i] * mix end
  end
  proc(tr.L, 0)
  proc(tr.R, 23)
end

local function finish(name, tr)
  local m = 0
  for i = 1, tr.n do
    local a, b = math.abs(tr.L[i]), math.abs(tr.R[i])
    if a > m then m = a end
    if b > m then m = b end
  end
  local g = 0.85 / math.max(m, 0.001)
  local sd = love.sound.newSoundData(tr.n, SR, 16, 2)
  local L, R = tr.L, tr.R
  for i = 1, tr.n do
    sd:setSample(i - 1, 1, L[i] * g)
    sd:setSample(i - 1, 2, R[i] * g)
  end
  out:push({ name = name, data = sd })
end

-------------------------------------------------------------- композиции
local A = {}
local function chord(t, dur, notes, vel, inst, tab)
  for i, n in ipairs(notes) do
    (inst or pad)(A.tr, t, dur, n, vel, (i - (#notes + 1) / 2) * 0.35, tab)
  end
end

-- Титры: «колыбельная под землёй» — музыкальная шкатулка в ля миноре
local function trackTitle()
  local tr = newTrack(38.4)
  A.tr = tr
  local bar = 4.8
  local prog = { { 45, 52, 57, 60 }, { 41, 48, 53, 57 }, { 43, 50, 55, 59 }, { 40, 47, 52, 56 },
    { 45, 52, 57, 60 }, { 41, 48, 53, 57 }, { 38, 45, 50, 53 }, { 40, 47, 52, 56 } }
  for i, c in ipairs(prog) do chord((i - 1) * bar, bar, c, 0.09) end
  local mel = { 81, 84, 88, 86, 84, 83, 81, 0, 77, 81, 84, 83, 81, 79, 77, 0,
    79, 83, 86, 84, 83, 81, 79, 0, 76, 80, 83, 81, 80, 76, 80, 0,
    81, 84, 88, 86, 84, 83, 81, 0, 77, 81, 84, 83, 81, 79, 77, 0,
    74, 77, 81, 79, 77, 76, 74, 0, 76, 80, 83, 86, 83, 80, 76, 0 }
  for i, n in ipairs(mel) do
    if n > 0 then musicbox(tr, (i - 1) * 0.6, n, 0.22 + (i % 4 == 1 and 0.06 or 0), ((i % 3) - 1) * 0.3) end
  end
  wind(tr, 0.05)
  reverb(tr, 0.9)
  return tr
end

-- Акт 1 «Прогулка»: спокойные арпеджио фортепиано
local function trackAct1()
  local tr = newTrack(48)
  A.tr = tr
  local prog = { { 45, 57, 60, 64, 67 }, { 41, 57, 60, 64, 65 }, { 48, 55, 60, 64, 67 }, { 43, 55, 59, 62, 67 } }
  for i, c in ipairs(prog) do
    local t0 = (i - 1) * 12
    bass(tr, t0, 11, c[1], 0.18)
    chord(t0, 11, { c[2], c[3], c[4] }, 0.05)
    local arp = { c[2], c[3], c[4], c[5], c[4], c[3] }
    for k = 0, 15 do
      piano(tr, t0 + k * 0.75, arp[k % #arp + 1] + (k % 6 == 3 and 12 or 0), 0.16 + (k % 4 == 0 and 0.05 or 0), (k % 2) * 0.4 - 0.2)
    end
  end
  reverb(tr, 0.7)
  return tr
end

-- Акт 2 «Мелочи»: редкие ноты, что-то не так
local function trackAct2()
  local tr = newTrack(48)
  A.tr = tr
  bass(tr, 0, 47, 26, 0.16)
  chord(0, 23, { 50, 57, 62 }, 0.05)
  chord(24, 23, { 50, 56, 63 }, 0.05)
  local notes = { 62, 65, 69, 68, 74, 72, 65, 63, 62, 70, 69, 68 }
  local t = 0.5
  local i = 1
  while t < 46 do
    piano(tr, t, notes[i], 0.14 + rnd() * 0.06, rnd() * 1.4 - 0.7, 5)
    t = t + 2.2 + rnd() * 2.6
    i = i % #notes + 1
  end
  glass(tr, 10, 9, 87, 0.025, 0.6)
  glass(tr, 33, 9, 88, 0.025, -0.6)
  reverb(tr, 1.0, 0.86)
  return tr
end

-- Акты 3–4 «Странности»: кластеры струнных, сердцебиение, стекло
local function trackAct3()
  local tr = newTrack(48)
  A.tr = tr
  strings(tr, 0, 22, 36, 0.12, -0.3)
  strings(tr, 2, 20, 37, 0.1, 0.3)
  strings(tr, 4, 18, 43, 0.08, 0)
  strings(tr, 24, 22, 35, 0.12, 0.3)
  strings(tr, 26, 20, 41, 0.1, -0.3)
  strings(tr, 28, 18, 42, 0.08, 0)
  bass(tr, 0, 47, 24, 0.2)
  for k = 0, 29 do heartbeat(tr, k * 1.6, 0.18) end
  glass(tr, 6, 12, 88, 0.03, 0.7)
  glass(tr, 8, 10, 89, 0.025, -0.7)
  glass(tr, 30, 12, 87, 0.03, -0.5)
  piano(tr, 15, 37, 0.25, 0, 6)
  piano(tr, 39, 36, 0.25, 0, 6)
  reverb(tr, 1.1, 0.87)
  return tr
end

-- Акт 5 «Могилы»: хор и челеста, ре дорийский
local function trackAct5()
  local tr = newTrack(48)
  A.tr = tr
  local prog = { { 50, 57, 62, 65 }, { 48, 55, 60, 64 }, { 46, 53, 58, 62 }, { 48, 55, 60, 64 } }
  for i, c in ipairs(prog) do
    local t0 = (i - 1) * 12
    bass(tr, t0, 11, c[1] - 12, 0.15)
    for k, n in ipairs(c) do choir(tr, t0, 11, n, 0.06, (k - 2.5) * 0.3) end
  end
  local mel = { 74, 77, 76, 74, 72, 74, 69, 0, 74, 77, 79, 77, 76, 72, 74, 0 }
  for i, n in ipairs(mel) do
    if n > 0 then musicbox(tr, 1 + (i - 1) * 3, n, 0.16, (i % 2) * 0.5 - 0.25) end
  end
  reverb(tr, 1.0, 0.88)
  return tr
end

-- Акт 6 / погоня: остинато, нарастающий кластер
local function trackAct6()
  local tr = newTrack(32)
  A.tr = tr
  local beat = 60 / 108
  local n = floor(32 / beat)
  for k = 0, n - 1 do
    local note = (k % 8 == 6) and 39 or 38
    voice(tr, k * beat, 0.5, 0, 0.32, (function()
      local o = osc(W_SAW, hz(note))
      return function(t) return o() * exp(-t * 6) * math.min(1, t / 0.01) end
    end)())
  end
  for k = 0, floor(32 / (beat * 2)) - 1 do heartbeat(tr, k * beat * 2, 0.25) end
  strings(tr, 0, 15, 50, 0.08, -0.4)
  strings(tr, 0, 15, 51, 0.07, 0.4)
  strings(tr, 16, 15, 53, 0.08, -0.4)
  strings(tr, 16, 15, 56, 0.07, 0.4)
  choir(tr, 8, 20, 62, 0.04, 0)
  bass(tr, 0, 31, 26, 0.2)
  reverb(tr, 0.6, 0.8)
  return tr
end

-- Концовка «Покой»: ре мажор, светло
local function trackEndB()
  local tr = newTrack(48)
  A.tr = tr
  local prog = { { 38, 62, 66, 69, 74 }, { 45, 61, 64, 69, 73 }, { 47, 62, 66, 71, 74 }, { 43, 62, 67, 71, 74 } }
  for i, c in ipairs(prog) do
    local t0 = (i - 1) * 12
    bass(tr, t0, 11, c[1], 0.16)
    chord(t0, 11, { c[2], c[3], c[4] }, 0.045)
    for k, nn in ipairs({ c[2], c[3], c[4] }) do choir(tr, t0 + 1, 10, nn, 0.03, (k - 2) * 0.4) end
    local arp = { c[2], c[3], c[4], c[5], c[4], c[3], c[4], c[5] }
    for k = 0, 15 do piano(tr, t0 + k * 0.75, arp[k % #arp + 1], 0.13, (k % 2) * 0.4 - 0.2) end
  end
  local mel = { 78, 76, 74, 76, 78, 81, 78, 0, 76, 74, 73, 74, 76, 78, 76, 0 }
  for i, n in ipairs(mel) do if n > 0 then musicbox(tr, 0.5 + (i - 1) * 3, n, 0.14, 0) end end
  bell(tr, 0, 62, 0.12, 0)
  reverb(tr, 0.8)
  return tr
end

-- Концовка «Побег»: одинокое фортепиано, ветер
local function trackEndA()
  local tr = newTrack(32)
  A.tr = tr
  local mel = { 76, 74, 71, 72, 71, 67, 69, 0, 71, 69, 67, 66, 64, 0, 0, 0 }
  for i, n in ipairs(mel) do
    if n > 0 then piano(tr, (i - 1) * 2, n, 0.22, 0, 5) end
  end
  for i, c in ipairs({ 40, 36, 43, 35 }) do piano(tr, (i - 1) * 8, c, 0.18, 0, 7) end
  pad(tr, 0, 30, 52, 0.04, 0)
  wind(tr, 0.08)
  reverb(tr, 1.0, 0.87)
  return tr
end

local list = {
  { "title", trackTitle }, { "act1", trackAct1 }, { "act2", trackAct2 }, { "act3", trackAct3 },
  { "act5", trackAct5 }, { "act6", trackAct6 }, { "endB", trackEndB }, { "endA", trackEndA },
}
for _, it in ipairs(list) do
  local ok, err = pcall(function() finish(it[1], it[2]()) end)
  if not ok then out:push({ name = it[1], err = tostring(err) }) end
  collectgarbage()
end
out:push({ name = "__done" })
