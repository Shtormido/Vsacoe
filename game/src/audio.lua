-- Процедурный звук: всё синтезируется при запуске, файлов нет.
local A = {
  data = {}, pool = {}, loops = {}, ambVol = {}, ambTarget = {}, ambSpeed = {},
  master = 0.8, ok = true, listenerX = 240,
}

local SR = 22050
local pi2 = math.pi * 2
local sin, exp, floor, rnd = math.sin, math.exp, math.floor, love.math.random

local function buf(sec)
  local t = {}
  for i = 1, floor(sec * SR) do t[i] = 0 end
  return t
end

local function toSD(b)
  local sd = love.sound.newSoundData(#b, SR, 16, 1)
  for i = 1, #b do
    local v = b[i]
    if v > 0.98 then v = 0.98 elseif v < -0.98 then v = -0.98 end
    sd:setSample(i - 1, v)
  end
  return sd
end

local function echo(b, delay, fb, taps)
  local d = floor(delay * SR)
  local out = {}
  local total = #b + d * taps
  for i = 1, total do out[i] = b[i] or 0 end
  for k = 1, taps do
    local g = fb ^ k
    local off = d * k
    for i = 1, #b do out[i + off] = out[i + off] + b[i] * g end
  end
  return out
end

local function gain(b, g) for i = 1, #b do b[i] = b[i] * g end return b end

-- Шум с фильтром нижних частот (a — коэффициент 0..1)
local function lpNoise(a)
  local y = 0
  return function()
    y = y + a * ((rnd() * 2 - 1) - y)
    return y
  end
end

-- Бесшовная петля шума: перекрёстное затухание хвоста в начало
local function loopify(b, xf)
  local X = floor(xf * SR)
  local L = #b - X
  local out = {}
  for i = 1, L do out[i] = b[i] end
  for i = 1, X do
    local t = i / X
    out[i] = b[i] * t + b[L + i] * (1 - t)
  end
  return out
end

-------------------------------------------------------------- генераторы
local gen = {}

function gen.drip()
  local b = buf(0.14)
  for i = 1, #b do
    local t = i / SR
    local f = 1500 * exp(-t * 28) + 480
    b[i] = sin(pi2 * f * t) * exp(-t * 38) * 0.55
  end
  return echo(b, 0.11, 0.38, 5)
end

local function stepBase(kind)
  local len = kind == "water" and 0.3 or (kind == "metal" and 0.45 or 0.09)
  local b = buf(len)
  local n1 = lpNoise(kind == "tile" and 0.65 or (kind == "water" and 0.12 or 0.3))
  local bub = 500 + rnd() * 400
  for i = 1, #b do
    local t = i / SR
    local v
    if kind == "metal" then
      v = (sin(pi2 * 420 * t) * 0.5 + sin(pi2 * 1130 * t) * 0.3 + sin(pi2 * 2210 * t) * 0.15) * exp(-t * 11) * 0.5
        + n1() * exp(-t * 80) * 0.3
    elseif kind == "water" then
      local env = (t < 0.04) and (t / 0.04) or exp(-(t - 0.04) * 14)
      v = n1() * env * 1.1 + sin(pi2 * bub * t * (1 + t * 2)) * exp(-t * 18) * 0.12
    elseif kind == "tile" then
      v = n1() * exp(-t * 95) * 0.55 + sin(pi2 * 1900 * t) * exp(-t * 220) * 0.2
    elseif kind == "gravel" then
      v = n1() * exp(-t * 45) * 0.5 * (rnd() < 0.3 and 1.6 or 1)
    else -- бетон
      v = n1() * exp(-t * 60) * 0.5 + sin(pi2 * 80 * t) * exp(-t * 50) * 0.3
    end
    b[i] = v
  end
  return b
end

local function blip(f, wave)
  local b = buf(0.055)
  for i = 1, #b do
    local t = i / SR
    local ph = (f * t) % 1
    local v
    if wave == "square" then v = ph < 0.5 and 1 or -1
    elseif wave == "saw" then v = ph * 2 - 1
    else v = 1 - 4 * math.abs(ph - 0.5) end
    local env = math.min(1, t / 0.004) * exp(-t * 35)
    b[i] = v * env * 0.18
  end
  return b
end

function gen.knock3()
  local b = buf(1.5)
  local n = lpNoise(0.5)
  for _, at in ipairs({ 0, 0.42, 0.84 }) do
    local s = floor(at * SR)
    for i = 1, floor(0.3 * SR) do
      local t = i / SR
      b[s + i] = b[s + i] + sin(pi2 * 92 * t) * exp(-t * 28) * 0.85 + n() * exp(-t * 90) * 0.45
    end
  end
  return echo(b, 0.17, 0.3, 3)
end

function gen.knock1()
  local b = buf(0.4)
  local n = lpNoise(0.5)
  for i = 1, #b do
    local t = i / SR
    b[i] = sin(pi2 * 92 * t) * exp(-t * 28) * 0.85 + n() * exp(-t * 90) * 0.45
  end
  return echo(b, 0.17, 0.3, 2)
end

function gen.crash()
  local b = buf(1.6)
  local n = lpNoise(0.7)
  local shards = {}
  for k = 1, 14 do shards[k] = { rnd() * 0.9, 1800 + rnd() * 2500 } end
  for i = 1, #b do
    local t = i / SR
    local v = n() * exp(-t * 7) * 0.8 + sin(pi2 * 55 * t) * exp(-t * 10) * 0.6
    for k = 1, #shards do
      local s = shards[k]
      local dt = t - s[1]
      if dt > 0 and dt < 0.06 then v = v + sin(pi2 * s[2] * dt) * exp(-dt * 70) * 0.25 end
    end
    b[i] = v
  end
  return echo(b, 0.21, 0.35, 4)
end

function gen.flask()
  local b = buf(1.1)
  local hits = { { 0, 1 }, { 0.26, 0.5 }, { 0.43, 0.3 }, { 0.55, 0.15 } }
  for _, h in ipairs(hits) do
    local s = floor(h[1] * SR)
    for i = 1, floor(0.5 * SR) do
      local t = i / SR
      if s + i <= #b then
        b[s + i] = b[s + i] + (sin(pi2 * 523 * t) * 0.5 + sin(pi2 * 1231 * t) * 0.35 + sin(pi2 * 1873 * t) * 0.2)
          * exp(-t * 9) * h[2] * 0.7
      end
    end
  end
  return echo(b, 0.19, 0.35, 4)
end

function gen.phone()
  local b = buf(4.0)
  for i = 1, #b do
    local t = i / SR
    if t < 1.8 then
      local hammer = ((t * 20) % 1) < 0.5 and 1 or 0.35
      b[i] = (sin(pi2 * 905 * t) + sin(pi2 * 1147 * t) * 0.8) * hammer * 0.22 * math.min(1, t * 30) * math.min(1, (1.8 - t) * 30)
    end
  end
  return b
end

function gen.inhale()
  local b = buf(0.75)
  local n1, n2 = lpNoise(0.35), lpNoise(0.08)
  for i = 1, #b do
    local t = i / SR
    local env = (t / 0.7) ^ 2 * (t < 0.7 and 1 or exp(-(t - 0.7) * 60))
    b[i] = (n1() - n2()) * env * 1.6
  end
  return b
end

function gen.whisper()
  local b = buf(2.4)
  local n1, n2 = lpNoise(0.7), lpNoise(0.2)
  local syl = {}
  for k = 1, 9 do syl[k] = { 0.1 + rnd() * 2.0, 0.08 + rnd() * 0.15 } end
  for i = 1, #b do
    local t = i / SR
    local env = 0
    for k = 1, #syl do
      local d = (t - syl[k][1]) / syl[k][2]
      env = env + exp(-d * d)
    end
    b[i] = (n1() - n2()) * math.min(env, 1.2) * 0.9
  end
  return echo(b, 0.23, 0.3, 3)
end

function gen.gasp()
  local b = buf(0.4)
  local n1, n2 = lpNoise(0.5), lpNoise(0.1)
  for i = 1, #b do
    local t = i / SR
    b[i] = (n1() - n2()) * math.min(1, t / 0.03) * exp(-t * 9) * 1.4
  end
  return b
end

function gen.caught()
  local b = buf(2.6)
  local n = lpNoise(0.05)
  for i = 1, #b do
    local t = i / SR
    local sw = math.min(1, t / 1.2)
    b[i] = sin(pi2 * (38 + t * 4) * t) * sw * exp(-math.max(0, t - 1.3) * 3) * 0.8 + n() * sw * 1.5 * exp(-math.max(0, t - 1.2) * 4)
  end
  return b
end

function gen.bell()
  local b = buf(5.5)
  local parts = { { 0.5, 0.5, 0.6 }, { 1, 1, 0.9 }, { 1.19, 0.5, 1.2 }, { 1.5, 0.4, 1.4 }, { 2.0, 0.35, 1.8 }, { 2.76, 0.25, 2.4 }, { 3.0, 0.2, 2.8 }, { 4.1, 0.12, 3.5 } }
  for i = 1, #b do
    local t = i / SR
    local v = 0
    for _, p in ipairs(parts) do v = v + sin(pi2 * 196 * p[1] * t) * p[2] * exp(-t * p[3]) end
    b[i] = v * 0.22 * math.min(1, t * 200)
  end
  return b
end

function gen.wood3()
  local b = buf(1.5)
  for _, at in ipairs({ 0, 0.45, 0.9 }) do
    local s = floor(at * SR)
    for i = 1, floor(0.2 * SR) do
      local t = i / SR
      b[s + i] = b[s + i] + (sin(pi2 * 380 * t) * 0.6 + sin(pi2 * 760 * t) * 0.2) * exp(-t * 35) * 0.6
    end
  end
  return echo(b, 0.15, 0.2, 2)
end

function gen.click()
  local b = buf(0.03)
  for i = 1, #b do local t = i / SR b[i] = (rnd() * 2 - 1) * exp(-t * 300) * 0.4 end
  return b
end

function gen.chalk()
  local b = buf(0.35)
  local n1, n2 = lpNoise(0.9), lpNoise(0.3)
  for i = 1, #b do
    local t = i / SR
    local jit = 0.5 + 0.5 * sin(pi2 * 23 * t)
    b[i] = (n1() - n2()) * jit * math.min(1, t * 40) * exp(-t * 4) * 0.5
  end
  return b
end

function gen.paper()
  local b = buf(0.35)
  local n1, n2 = lpNoise(0.8), lpNoise(0.25)
  for i = 1, #b do
    local t = i / SR
    b[i] = (n1() - n2()) * (0.3 + 0.7 * rnd()) * exp(-t * 8) * 0.45
  end
  return b
end

function gen.whoosh()
  local b = buf(0.6)
  local n = lpNoise(0.1)
  for i = 1, #b do
    local t = i / SR
    b[i] = n() * sin(math.pi * t / 0.6) * 1.2
  end
  return b
end

function gen.thud()
  local b = buf(0.5)
  local n = lpNoise(0.2)
  for i = 1, #b do
    local t = i / SR
    b[i] = sin(pi2 * 60 * t) * exp(-t * 12) * 0.8 + n() * exp(-t * 25) * 0.6
  end
  return echo(b, 0.2, 0.3, 3)
end

function gen.collapse()
  local b = buf(2.4)
  local n = lpNoise(0.25)
  for i = 1, #b do
    local t = i / SR
    local pulses = 0.6 + 0.4 * sin(pi2 * 7 * t + sin(pi2 * 1.3 * t) * 3)
    b[i] = n() * exp(-t * 1.6) * pulses * 1.3 + sin(pi2 * 45 * t) * exp(-t * 2.5) * 0.5
  end
  return echo(b, 0.25, 0.3, 3)
end

function gen.crack()
  local b = buf(0.25)
  local n = lpNoise(0.8)
  for i = 1, #b do
    local t = i / SR
    b[i] = n() * exp(-t * 40) * 0.9 + sin(pi2 * 110 * t) * exp(-t * 30) * 0.4
  end
  return b
end

function gen.sting()
  -- тихий «укол» для настоящих скримеров: низкий удар без рывка
  local b = buf(2.0)
  for i = 1, #b do
    local t = i / SR
    b[i] = (sin(pi2 * 41 * t) * 0.7 + sin(pi2 * 61.7 * t) * 0.4 + sin(pi2 * 1220 * t) * 0.05 * exp(-t * 3)) * exp(-t * 1.8) * math.min(1, t * 80) * 0.8
  end
  return b
end

-------------------------------------------------------------- петли
function gen.hum()
  local b = buf(3.4)
  local n = lpNoise(0.02)
  for i = 1, #b do
    local t = i / SR
    b[i] = n() * 2.6 + sin(pi2 * 50 * t) * 0.05
  end
  return loopify(b, 0.4)
end

function gen.wind()
  local b = buf(5.5)
  local y, y2 = 0, 0
  for i = 1, #b do
    local t = i / SR
    local a = 0.02 + 0.03 * (0.5 + 0.5 * sin(pi2 * 0.3 * t))
    y = y + a * ((rnd() * 2 - 1) - y)
    y2 = y2 + 0.4 * (y - y2)
    b[i] = y2 * 3.0
  end
  return loopify(b, 0.5)
end

function gen.water()
  local b = buf(3.5)
  local n = lpNoise(0.15)
  for i = 1, #b do
    local t = i / SR
    b[i] = n() * (0.5 + 0.3 * sin(pi2 * 1.7 * t) * sin(pi2 * 0.9 * t)) * 0.6
  end
  return loopify(b, 0.5)
end

function gen.drone()
  local L = 8
  local b = buf(L)
  for i = 1, #b do
    local t = i / SR
    local lfo = 0.75 + 0.25 * sin(pi2 * t / L)
    b[i] = (sin(pi2 * 55 * t) * 0.5 + sin(pi2 * 55.375 * t) * 0.4 + sin(pi2 * 82.5 * t) * 0.2 + sin(pi2 * 110.25 * t) * 0.1) * lfo * 0.45
  end
  return b
end

-- Низкий хор без слов (Безымянные). Все частоты кратны 1/8 Гц — петля бесшовная.
function gen.choir()
  local L = 8
  local b = buf(L)
  local fund = { 98, 116.5, 146.75 }
  for i = 1, #b do
    local t = i / SR
    local v = 0
    for vi, f in ipairs(fund) do
      local vib = 0.004 * sin(pi2 * 5 * t + vi)
      for k = 1, 10 do
        local h = f * k
        local w = (math.exp(-((h - 650) / 220) ^ 2) + 0.6 * math.exp(-((h - 1080) / 260) ^ 2) + 0.5 / k)
        v = v + sin(pi2 * h * t + k * f * vib * 30) * w / k
      end
    end
    local swell = 0.65 + 0.35 * sin(pi2 * t / L)
    b[i] = v * 0.12 * swell
  end
  return b
end

-- Женское пение без слов (добрые духи)
function gen.sing()
  local notes = { 293.66, 349.23, 329.63, 293.66, 261.63, 293.66, 220.0, 293.66 }
  local nl = 1.35
  local L = #notes * nl + 1.2
  local b = buf(L)
  local ph = 0
  for i = 1, #b do
    local t = i / SR
    local ni = floor(t / nl) + 1
    local v = 0
    if ni <= #notes then
      local lt = t - (ni - 1) * nl
      local f = notes[ni] * (1 + 0.006 * sin(pi2 * 5.5 * t))
      ph = ph + pi2 * f / SR
      local env = math.min(1, lt / 0.25) * math.min(1, (nl - lt) / 0.3)
      v = (sin(ph) + 0.3 * sin(2 * ph) + 0.12 * sin(3 * ph) + 0.05 * sin(4 * ph)) * env
    end
    b[i] = v * 0.16
  end
  return echo(b, 0.29, 0.35, 3)
end

-------------------------------------------------------------- API
local function makeSource(sd, kind)
  local s = love.audio.newSource(sd, kind or "static")
  return s
end

function A.init()
  local ok, err = pcall(function()
    local list = { "drip", "knock3", "knock1", "crash", "flask", "phone", "inhale", "whisper", "gasp", "caught",
      "bell", "wood3", "click", "chalk", "paper", "whoosh", "thud", "collapse", "crack", "sting" }
    for _, n in ipairs(list) do A.data[n] = toSD(gen[n]()) end
    for _, k in ipairs({ "concrete", "tile", "water", "metal", "gravel" }) do
      local base = stepBase(k)
      A.data["step_" .. k] = toSD(base)
      A.data["stepE_" .. k] = toSD(echo(base, 0.13, 0.35, 4))
    end
    A.data.blip_DIMA = toSD(blip(300, "square"))
    A.data.blip_LEHA = toSD(blip(410, "square"))
    A.data.blip_SPIRIT = toSD(blip(620, "tri"))
    A.data.blip_ENEMY = toSD(blip(118, "saw"))
    A.data.blip_OTHER = toSD(blip(350, "tri"))
    for _, n in ipairs({ "hum", "wind", "water", "drone", "choir", "sing" }) do
      local s = makeSource(toSD(gen[n]()))
      s:setLooping(true)
      s:setVolume(0)
      A.loops[n] = s
      A.ambVol[n] = 0
      A.ambTarget[n] = 0
      A.ambSpeed[n] = 0.5
    end
    A.loops.phone = makeSource(A.data.phone)
    A.loops.phone:setLooping(true)
    love.audio.setDistanceModel("none")
  end)
  if not ok then
    A.ok = false
    print("Звук отключён: " .. tostring(err))
  end
end

function A.play(name, vol, pitch, wx)
  if not A.ok then return end
  local sd = A.data[name]
  if not sd then return end
  local p = A.pool[name]
  if not p then p = {} A.pool[name] = p end
  local src
  for _, s in ipairs(p) do
    if not s:isPlaying() then src = s break end
  end
  if not src then
    if #p >= 6 then src = p[1] src:stop() else
      src = makeSource(sd)
      p[#p + 1] = src
    end
  end
  src:setVolume((vol or 1) * A.master)
  src:setPitch(pitch or 1)
  if wx then
    local dx = U.clamp((wx - A.listenerX) / 260, -1, 1)
    src:setPosition(dx, 0, 0.6)
  else
    src:setPosition(0, 0, 0)
  end
  src:play()
  return src
end

function A.amb(name, vol, speed)
  if not A.ok or not A.loops[name] then return end
  A.ambTarget[name] = vol
  A.ambSpeed[name] = speed or 0.5
end

function A.silenceAll(speed)
  for n in pairs(A.ambTarget) do A.ambTarget[n] = 0 A.ambSpeed[n] = speed or 2 end
end

function A.phone(on)
  if not A.ok then return end
  if on then A.loops.phone:setVolume(0.7 * A.master) A.loops.phone:play() else A.loops.phone:stop() end
end

function A.update(dt, duck)
  if not A.ok then return end
  duck = duck or 1
  for n, s in pairs(A.loops) do
    if n ~= "phone" then
      local v = U.approach(A.ambVol[n], A.ambTarget[n], dt * A.ambSpeed[n])
      A.ambVol[n] = v
      local out = v * A.master * duck
      s:setVolume(out)
      if out > 0.001 then
        if not s:isPlaying() then s:play() end
      elseif s:isPlaying() then
        s:pause()
      end
    end
  end
end

function A.stopAll()
  if not A.ok then return end
  for n in pairs(A.ambTarget) do A.ambTarget[n] = 0 A.ambVol[n] = 0 end
  for _, s in pairs(A.loops) do s:stop() end
  for _, p in pairs(A.pool) do for _, s in ipairs(p) do s:stop() end end
end

return A
