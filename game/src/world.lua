-- Мир: сцены, Дима и Лёха, предметы, триггеры, свет, духи
local Wd = {
  scenes = {}, sceneId = nil, sc = nil,
  player = { x = 100, facing = 1, pose = "idle", frame = 0, dist = 0 },
  leha = { x = 70, facing = 1, pose = "idle", frame = 0, dist = 0, visible = true },
  camx = 0, fade = 1, fadeTarget = 0, fadeSpeed = 1,
  shakeT = 0, shakeA = 0, hover = nil, noiseT = 0,
  breath = { t = 0, ok = false, releasedAt = nil, active = false, flash = 0, last = "" },
  fx = { aberr = 0, aberrT = 0 }, parts = {}, motes = {},
}

FLOOR = 232
local lg = love.graphics

function Wd.register(id, def)
  def.id = id
  Wd.scenes[id] = def
end

function Wd.fadeTo(v, t)
  Wd.fadeTarget = v
  Wd.fadeSpeed = 1 / math.max(0.01, t)
end

function Wd.shake(a, d)
  if G.settings and not G.settings.shake then return end
  Wd.shakeA = a
  Wd.shakeT = d
end

-- Испуг: хроматическая аберрация на пару секунд
function Wd.scareFX(k)
  Wd.fx.aberrT = math.max(Wd.fx.aberrT, k or 3)
end

-- Подземелье? (для тумана, капель и пыли в луче)
function Wd.underground()
  local def = Wd.sc.def
  if def.custom or def.noFx then return false end
  local amb = def.ambient or { 0.05 }
  return amb[1] < 0.2
end

-------------------------------------------------------------- частицы: капли и пыль
function Wd.updateParticles(dt)
  local sc = Wd.sc
  local parts = Wd.parts
  if Wd.underground() then
    sc.dripT = (sc.dripT or 0) - dt
    if sc.dripT <= 0 then
      sc.dripT = 0.5 + love.math.random() * 1.4
      parts[#parts + 1] = { kind = "drip", x = Wd.camx + love.math.random() * W, y = 24 + love.math.random() * 30, vy = 0 }
    end
    if love.math.random() < dt * 3 then
      parts[#parts + 1] = { kind = "dust", x = Wd.camx + love.math.random() * W, y = 20 + love.math.random() * 60, vy = 3 + love.math.random() * 4, t = 0 }
    end
  end
  Fx.updateBreath(sc, dt, parts)
  for i = #parts, 1, -1 do
    local q = parts[i]
    if q.kind == "breath" then
      q.t = q.t + dt
      q.x = q.x + q.vx * dt
      q.y = q.y - 5 * dt
      if q.t > 1.6 then table.remove(parts, i) end
    elseif q.kind == "drip" then
      q.vy = q.vy + dt * 320
      q.y = q.y + q.vy * dt
      if q.y >= FLOOR + 4 then
        q.kind = "splash"
        q.t = 0
        if love.math.random() < 0.15 then Audio.play("drip", 0.12, 0.9 + love.math.random() * 0.3, q.x) end
      end
    elseif q.kind == "splash" then
      q.t = q.t + dt
      if q.t > 0.25 then table.remove(parts, i) end
    else
      q.t = q.t + dt
      q.y = q.y + q.vy * dt
      q.x = q.x + math.sin(q.t * 1.7 + q.y) * dt * 3
      if q.y > FLOOR or q.t > 12 then table.remove(parts, i) end
    end
  end
  if #parts > 160 then table.remove(parts, 1) end
end

function Wd.drawParticles()
  for _, q in ipairs(Wd.parts) do
    if q.kind == "breath" then
      local s = q.t * 3
      Gx.r(P.gray4, q.x - s, q.y - s / 2, 2 + s * 2, 1 + s, 0.2 * (1 - q.t / 1.6))
    elseif q.kind == "drip" then
      Gx.r(P.blue3, q.x, q.y, 1, 2, 0.7)
    elseif q.kind == "splash" then
      local k = q.t * 24
      Gx.px(P.blue3, q.x - k, FLOOR + 3 - k * 0.6, 0.6)
      Gx.px(P.blue3, q.x + k, FLOOR + 3 - k * 0.6, 0.6)
      Gx.r(P.blue3, q.x - 2, FLOOR + 4, 5, 1, 0.4 * (1 - q.t * 4))
    else
      Gx.px(P.gray3, q.x, q.y, 0.5)
    end
  end
end

-- Туман у пола: освещается фонарём
function Wd.drawFog()
  local sc = Wd.sc
  local t = sc.t
  local x0 = math.floor(Wd.camx / 4) * 4 - 8
  for layer = 1, 2 do
    for x = x0, x0 + W + 16, 4 do
      local n = love.math.noise(x * 0.015 + t * 0.03 * layer, layer * 7.3)
      local h = math.floor(4 + n * 16)
      Gx.r(P.gray3, x, H - 6 - layer * 14 - h + 24, 4, h, 0.035 + layer * 0.02)
    end
  end
end

-- Пыль в луче фонаря и у источников света (рисуется после освещения)
function Wd.drawMotes()
  local sc = Wd.sc
  if not Wd.underground() then return end
  local m = Wd.motes
  if #m == 0 then
    for i = 1, 110 do m[i] = { x = love.math.random() * W, y = 20 + love.math.random() * 220, s = 0.5 + love.math.random(), ph = love.math.random() * 6 } end
  end
  local t = love.timer.getTime()
  local c = Wd.coneWorld
  local lights = Wd.lastLights or {}
  for _, q in ipairs(m) do
    local wx = (q.x + t * 2 * q.s - Wd.camx * 0.15) % W + Wd.camx
    local wy = q.y + math.sin(t * 0.6 * q.s + q.ph) * 6
    local a = 0
    if c then
      local vx, vy = wx - c[1], wy - c[2]
      local d = math.sqrt(vx * vx + vy * vy)
      if d > 4 and d < c[5] then
        local cs = (vx * c[3] + vy * c[4]) / d
        local edge = math.cos(c[6])
        if cs > edge then a = math.min(1, (cs - edge) / (1 - edge) * 3) * (1 - d / c[5]) end
      end
    end
    for _, L in ipairs(lights) do
      local d = math.sqrt((wx - L[1]) ^ 2 + (wy - L[2]) ^ 2)
      if d < L[3] * 0.6 then a = a + (1 - d / (L[3] * 0.6)) * 0.5 end
    end
    if a > 0.05 then
      local tw = 0.6 + 0.4 * math.sin(t * 5 * q.s + q.ph)
      Gx.px(P.yellow, wx - Wd.camx, wy, math.min(0.9, a * tw))
    end
  end
end

-------------------------------------------------------------- вход в сцену
function Wd.enter(id, x, facing)
  local def = Wd.scenes[id]
  assert(def, "Нет сцены " .. tostring(id))
  if Wd.sc and Wd.sc.def.leave then Wd.sc.def.leave(Wd.sc) end
  Wd.sceneId = id
  G.scene = id
  local sc = { def = def, id = id, t = 0, w = def.w or W, actors = {}, enemies = {}, v = {}, running = {}, lights = {} }
  Wd.sc = sc
  Wd.parts = {}
  Fx.sparks = {}
  Fx.flash = 0
  if not def.custom and (def.ambient or { 0.05 })[1] < 0.2 then Fx.makePuddles(sc) else Fx.puddles = {} Fx.vents = {} end
  local p, l = Wd.player, Wd.leha
  p.x = x or def.spawn or 40
  p.tx, p.pending = nil, nil
  p.pose = "idle"
  p.facing = facing or def.facing or 1
  p.hidden = false
  l.visible = def.leha ~= false
  l.manual = false
  l.tx = nil
  l.pose = "idle"
  l.eyesRed = false
  l.slow = false
  l.x = U.clamp(p.x - p.facing * 24, 6, sc.w - 6)
  l.facing = p.facing
  G.marks[id] = G.marks[id] or {}
  if def.static then
    lg.push("all")
    sc.canvas = lg.newCanvas(sc.w, H)
    lg.setCanvas(sc.canvas)
    lg.clear(0, 0, 0, 1)
    lg.origin()
    Gx.world = true
    def.static(sc)
    if not def.custom and def.grime ~= false and (def.ambient or { 0.05 })[1] < 0.2 then
      Gx.grime(sc)
      Fx.decorate(sc)
    end
    Gx.world = false
    lg.pop()
  end
  -- атмосфера
  local amb = def.amb or {}
  for _, n in ipairs({ "hum", "wind", "water", "drone", "choir", "sing" }) do
    local v = amb[n] or 0
    if n == "drone" and G.flags.drone and not amb.noDrone then v = math.max(v, 0.25) end
    if n == "choir" and G.flags.choir and not amb.noChoir then v = math.max(v, 0.18) end
    Audio.amb(n, v, 0.4)
  end
  -- музыка: по сцене или по акту
  local mus = def.music
  if mus == nil then mus = ({ "act1", "act2", "act3", "act3", "act5", "act6" })[G.act or 1] or "act3" end
  if mus then Audio.setMusic(mus, def.musicVol or 0.5) else Audio.musicMult(0, 0.5) end
  if def.setup then def.setup(sc) end
  Wd.snapCamera()
  if def.enter then Script.run(function() def.enter(sc) end, def.enterBlock ~= false, "enter") end
end

-- Переход с затемнением (вызывать из сценария)
function Wd.go(id, x, facing)
  fadeOut(0.45)
  Dialog.clear()
  Wd.enter(id, x, facing)
  fadeIn(0.45)
end

function Wd.snapCamera()
  local sc = Wd.sc
  if sc.w <= W then Wd.camx = math.floor((sc.w - W) / 2) return end
  Wd.camx = U.clamp(Wd.player.x - W / 2, 0, sc.w - W)
end

-------------------------------------------------------------- предметы
function Wd.objects()
  local sc = Wd.sc
  local list = {}
  for _, o in ipairs(sc.def.objects or {}) do
    if not o.cond or o.cond(sc) then list[#list + 1] = o end
  end
  return list
end

local function objRect(o)
  local h = o.h or 20
  return o.x, (o.y or (FLOOR - h)), o.w or 20, h
end

function Wd.objectAt(wx, wy)
  local best, ba
  for _, o in ipairs(Wd.objects()) do
    local x, y, w, h = objRect(o)
    if wx >= x - 2 and wx <= x + w + 2 and wy >= y - 2 and wy <= y + h + 2 then
      local a = w * h
      if not best or a < ba then best, ba = o, a end
    end
  end
  return best
end

function Wd.examine(o)
  local sc = Wd.sc
  local key = Wd.sceneId .. ":" .. o.id
  local first = not G.seen[key]
  local lines = o.lines
  if type(lines) == "function" then lines = lines(sc) end
  if not first then
    local s = o.short
    if type(s) == "function" then s = s(sc) end
    lines = s or { lines[1] }
  end
  G.seen[key] = true
  if o.inspect ~= false then
    Wd.player.pose = "inspect"
    wait(0.9)
    Wd.player.pose = "idle"
  end
  if lines then talk(lines) end
  if first then
    local full = o.lines
    if type(full) == "function" then full = full(sc) end
    local txt = o.note or (o.name .. ": " .. ((full and full[1] and full[1][2]) or ""))
    State.note("n:" .. key, txt)
  end
  if o.after then o.after(o, sc, first) end
end

function Wd.useObject(o)
  local p = Wd.player
  local cx = o.x + (o.w or 20) / 2
  if math.abs(cx - p.x) > 2 then p.facing = cx > p.x and 1 or -1 end
  if o.exit then
    local e = o.exit
    if type(e) == "function" then e = e(Wd.sc) end
    if e then
      Script.run(function()
        if e.pre then e.pre() end
        Wd.go(e.to, e.x, e.facing)
      end, true, "exit")
    end
    return
  end
  Script.run(function()
    if o.use then o.use(o, Wd.sc) else Wd.examine(o) end
  end, true, "use")
end

-------------------------------------------------------------- ввод
function Wd.canControl()
  return not UI.modal and not Script.blocking() and not Wd.sc.def.custom and not UI.listening and not Wd.player.frozen
end

function Wd.click(wx, wy, button)
  local p = Wd.player
  if button == 2 then
    p.tx, p.pending = nil, nil
    return
  end
  local o = Wd.objectAt(wx, wy)
  if o then
    local ax = o.ax or (o.x + (o.w or 20) / 2)
    if o.exit then ax = o.ax or ax end
    ax = U.clamp(ax, Wd.sc.def.minX or 6, Wd.sc.w - (Wd.sc.def.maxX or 6))
    p.tx = ax
    p.pending = o
    if math.abs(ax - p.x) < 2 then p.tx = nil Wd.arrive() end
  else
    p.pending = nil
    p.tx = U.clamp(wx, Wd.sc.def.minX or 6, Wd.sc.w - (Wd.sc.def.maxX or 6))
  end
end

function Wd.arrive()
  local p = Wd.player
  local o = p.pending
  p.pending = nil
  if o then Wd.useObject(o) end
end

-------------------------------------------------------------- фонарь
function Wd.toggleLight()
  if not G.flags.lightTut then hint("Фонарь пока не нужен", 2) return end
  if G.battery <= 0 then
    if G.spares > 0 then hint("Батарейка села. R — заменить", 3) else hint("Батарейка села", 2) end
    return
  end
  G.light = not G.light
  Audio.play("click", 0.6)
end

function Wd.swapBattery()
  if G.spares <= 0 then hint("Запасных батареек нет", 2) return end
  G.spares = G.spares - 1
  G.battery = 1
  Audio.play("click", 0.6)
  UI.toast("Новая батарейка. Осталось запасных: " .. G.spares)
end

function Wd.placeMark()
  local sc = Wd.sc
  if sc.def.noChalk then return end
  local p = Wd.player
  local marks = G.marks[Wd.sceneId]
  if #marks > 40 then table.remove(marks, 1) end
  local kind = love.keyboard.isDown("lshift", "rshift") and "x" or "arrow"
  table.insert(marks, { x = math.floor(p.x + p.facing * 10), y = FLOOR - 46, dir = p.facing, kind = kind })
  Audio.play("chalk", 0.7)
  p.pose = "inspect"
  p.poseT = 0.5
end

-------------------------------------------------------------- «Замри»: дыхание в ритме
local CYCLE, WIN_A, WIN_B = 3.0, 2.15, 2.9

function Wd.breathReset()
  local b = Wd.breath
  b.t = 0 b.ok = false b.releasedAt = nil b.flash = 0
end

function Wd.spaceReleased()
  local b = Wd.breath
  if Wd.player.frozen and b.active then b.releasedAt = 0 end
end

function Wd.spacePressed()
  local b = Wd.breath
  if b.releasedAt then
    local ph = b.t % CYCLE
    if ph >= WIN_A and ph <= WIN_B and not b.ok then
      b.ok = true
      b.last = "good"
      b.flash = 0.4
    else
      Wd.makeNoise("Шумный вдох")
    end
    b.releasedAt = nil
  end
end

function Wd.makeNoise(why)
  Wd.noiseT = 1.4
  Wd.breath.last = "bad"
  Wd.breath.flash = 0.5
  Audio.play("gasp", 0.7)
end

function Wd.updateFreeze(dt)
  local p, b = Wd.player, Wd.breath
  local want = love.keyboard.isDown("space") and not UI.modal and not Wd.sc.def.custom and Wd.sc.def.allowFreeze ~= false
  if b.releasedAt then
    b.releasedAt = b.releasedAt + dt
    if b.releasedAt < 0.45 then want = true else b.releasedAt = nil end
  end
  if want and not p.frozen and Script.blocking() and not Wd.sc.danger then want = false end
  if want and not p.frozen then
    p.frozen = true
    p.tx, p.pending = nil, nil
    p.savedLight = G.light
    G.light = false
    Wd.breathReset()
  elseif not want and p.frozen then
    p.frozen = false
    if p.savedLight and G.battery > 0 then G.light = true end
  end
  b.active = p.frozen and (#Wd.sc.enemies > 0 or Wd.sc.danger)
  if b.active then
    local prev = b.t % CYCLE
    b.t = b.t + dt
    local now = b.t % CYCLE
    if now < prev then
      if not b.ok then Wd.makeNoise("Задержал дыхание") end
      b.ok = false
    end
  end
  if b.flash > 0 then b.flash = b.flash - dt end
end

-- Игрок спрятан от духов?
function Wd.isHidden(kind, ex)
  local p = Wd.player
  if not p.frozen or Wd.noiseT > 0 then return false end
  if kind == "preacher" then
    local sc = Wd.sc
    local behind = false
    for _, hz in ipairs(sc.hide or {}) do
      if p.x >= hz[1] and p.x <= hz[2] then behind = true end
    end
    local away = (ex - p.x) * p.facing < 0
    return behind or away
  end
  return true
end

-------------------------------------------------------------- пойман
function Wd.caught(respawn, x, loss, onRespawn)
  if Wd.sc.caughtNow then return end
  Wd.sc.caughtNow = true
  Script.run(function()
    Dialog.clear()
    Audio.play("caught", 0.9)
    Wd.player.frozen = false
    fadeOut(1.4)
    G.battery = math.max(0, G.battery - (loss or 0))
    wait(0.8)
    Wd.enter(respawn, x)
    if onRespawn then onRespawn() end
    fadeIn(1.2)
    hint("Тебя коснулись. Ты очнулся у точки отдыха.", 4)
  end, true, "caught")
end

-------------------------------------------------------------- обновление
local stepDist = 13

local function surfaceAt(x)
  local s = Wd.sc.def.surface
  if type(s) == "function" then return s(x) end
  return s or "concrete"
end

local function moveEntity(e, dt, speed, isLeha)
  if not e.tx then return false end
  local dx = e.tx - e.x
  if math.abs(dx) < 1.2 then
    e.x = e.tx
    e.tx = nil
    e.pose = "idle"
    return true
  end
  local s = math.min(math.abs(dx), speed * dt)
  e.x = e.x + U.sign(dx) * s
  e.facing = U.sign(dx)
  e.pose = "walk"
  e.dist = e.dist + s
  e.frame = math.floor(e.dist / 6) % 4
  e.stepAcc = (e.stepAcc or 0) + s
  if e.stepAcc > stepDist then
    e.stepAcc = 0
    local surf = surfaceAt(e.x)
    local nm = (Wd.sc.def.echo and "stepE_" or "step_") .. surf
    Audio.play(nm, isLeha and 0.32 or 0.42, (isLeha and 0.86 or 1.0) + love.math.random() * 0.1, e.x)
    if Wd.sc.def.onStep then Wd.sc.def.onStep(Wd.sc, e, isLeha) end
  end
  return false
end

function Wd.update(dt)
  local sc = Wd.sc
  local def = sc.def
  local p, l = Wd.player, Wd.leha
  local modal = UI.modal ~= nil
  if Wd.fade ~= Wd.fadeTarget then Wd.fade = U.approach(Wd.fade, Wd.fadeTarget, dt * Wd.fadeSpeed) end
  if Wd.shakeT > 0 then Wd.shakeT = Wd.shakeT - dt end
  if Wd.noiseT > 0 then Wd.noiseT = Wd.noiseT - dt end
  do
    local fx = Wd.fx
    fx.aberrT = math.max(0, fx.aberrT - dt * 2.5)
    local base = (Wd.sc and not Wd.sc.def.custom and Wd.spiritNear()) and 0.6 or 0
    fx.aberr = U.approach(fx.aberr, base + fx.aberrT, dt * 8)
  end
  if modal then return end
  sc.t = sc.t + dt
  G.time = G.time + dt

  if def.custom then
    if def.update then def.update(sc, dt) end
    Wd.processTriggers(sc)
    return
  end

  Wd.updateFreeze(dt)

  -- клавиатурная ходьба
  if Wd.canControl() then
    local kx = 0
    if love.keyboard.isDown("a", "left") then kx = -1 end
    if love.keyboard.isDown("d", "right") then kx = 1 end
    if kx ~= 0 then
      p.pending = nil
      p.tx = U.clamp(p.x + kx * 12, def.minX or 6, sc.w - (def.maxX or 6))
    end
  end
  if p.frozen then p.tx = nil p.pose = "freeze" end

  -- Дима
  local spd = (def.speed or 58)
  if moveEntity(p, dt, spd, false) and p.pending then Wd.arrive() end
  if p.poseT then
    p.poseT = p.poseT - dt
    if p.poseT <= 0 then p.poseT = nil if p.pose == "inspect" then p.pose = "idle" end end
  end
  if not p.tx and p.pose == "walk" then p.pose = "idle" end
  if not p.frozen and p.pose == "freeze" then p.pose = "idle" end
  -- поворот к курсору в покое
  if not p.tx and (p.pose == "idle" or p.frozen) and (not Script.blocking() or Wd.sc.danger) then
    local mx = UI.mouseWorldX()
    if mx and math.abs(mx - p.x) > 12 then p.facing = mx > p.x and 1 or -1 end
  end

  -- Лёха
  if l.visible then
    if l.manual then
      moveEntity(l, dt, l.slow and 30 or spd * 1.05, true)
    else
      local desired = p.x - p.facing * 26
      desired = U.clamp(desired, 6, sc.w - 6)
      local d = desired - l.x
      local lag = l.slow and 50 or 30
      if math.abs(d) > lag or (l.tx and math.abs(d) > 4) then
        l.tx = desired
      end
      moveEntity(l, dt, l.slow and 34 or spd * 1.06, true)
      if not l.tx and l.pose == "idle" then
        if math.abs(p.x - l.x) > 3 then l.facing = p.x > l.x and 1 or -1 end
      end
    end
  end

  -- фонарь
  if G.light then
    local drain = (G.dim and 0.5 or 1) * (def.drain or 1) / 2400
    G.battery = G.battery - dt * drain
    if G.battery <= 0 then
      G.battery = 0
      G.light = false
      if G.spares > 0 then hint("Батарейка села. R — заменить", 4) else hint("Батарейка села", 3) end
    end
  end

  -- камера
  if sc.w > W then
    local target = U.clamp(p.x - W / 2 + p.facing * 24, 0, sc.w - W)
    Wd.camx = Wd.camx + (target - Wd.camx) * math.min(1, dt * 3)
  end
  Audio.listenerX = Wd.camx + W / 2

  if def.update then def.update(sc, dt) end
  Wd.updateParticles(dt)
  Fx.updateFlash(sc, dt)
  Fx.updateSparks(sc, dt)
  Wd.processTriggers(sc)
end

function Wd.processTriggers(sc)
  local def = sc.def
  if Script.blocking() then return end
  local px = Wd.player.x
  for i, z in ipairs(def.zones or {}) do
    local key = Wd.sceneId .. ":z:" .. (z.id or i)
    if not G.done[key] and not sc.running[key] and px >= z.x1 and px <= z.x2 and (not z.cond or z.cond(sc)) then
      G.done[key] = true
      sc.running[key] = true
      Script.run(function() z.fn(sc) sc.running[key] = nil end, z.block ~= false, key)
      if z.block ~= false then return end
    end
  end
  for i, tm in ipairs(def.timers or {}) do
    local key = Wd.sceneId .. ":t:" .. (tm.id or i)
    local tt = tm.t
    if type(tt) == "function" then tt = tt(sc) end
    if not G.done[key] and not sc.running[key] and tt and sc.t >= tt and (not tm.cond or tm.cond(sc)) then
      G.done[key] = true
      sc.running[key] = true
      Script.run(function() tm.fn(sc) sc.running[key] = nil end, tm.block ~= false, key)
      if tm.block ~= false then return end
    end
  end
end

-------------------------------------------------------------- позиции говорящих
function Wd.speakerPos(sp, opts)
  if opts and opts.at then return opts.at[1], opts.at[2] end
  local sc = Wd.sc
  if not sc or sc.def.custom then
    if sc and sc.def.speakerPos then return sc.def.speakerPos(sc, sp) end
    return nil
  end
  if sp == "DIMA" then return Wd.player.x, FLOOR - 48 + (Wd.player.pose == "sit" and 10 or 0) end
  if sp == "LEHA" or sp == "CHOIR" then
    if Wd.leha.visible then return Wd.leha.x, FLOOR - 48 + (Wd.leha.pose == "sit" and 10 or 0) end
    return nil
  end
  local a = sc.actors[sp]
  if a and a.visible ~= false then return a.x, (a.y or FLOOR) - (a.h or 50) end
  return nil
end

-------------------------------------------------------------- отрисовка мира
function Wd.drawMarks()
  for _, m in ipairs(G.marks[Wd.sceneId] or {}) do
    local x, y = m.x, m.y
    if m.kind == "x" then
      Gx.line(P.white, x - 4, y - 4, x + 4, y + 4, 0.85)
      Gx.line(P.white, x - 4, y + 4, x + 4, y - 4, 0.85)
    else
      local d = m.dir
      Gx.line(P.white, x - 6 * d, y, x + 6 * d, y, 0.85)
      Gx.line(P.white, x + 6 * d, y, x + 2 * d, y - 4, 0.85)
      Gx.line(P.white, x + 6 * d, y, x + 2 * d, y + 4, 0.85)
    end
  end
end

function Wd.drawActor(a, sc)
  if a.visible == false then return end
  Fx.spiritAura(a, sc)
  local t = sc.t
  if a.kind == "evd" then Gx.evdokia(a.x, a.y or FLOOR, t, a.a)
  elseif a.kind == "alesha" then Gx.alesha(a.x, a.y or FLOOR, t, a.a, a.horse)
  elseif a.kind == "helmet" then Gx.helmetGlow(a.x, a.y, t, a.a)
  elseif a.kind == "preacher" then Gx.preacher(a.x, a.y or FLOOR, t, a.a, a.facing)
  elseif a.kind == "nameless" then Gx.nameless(a.x, a.y or FLOOR, t, a.a, a.variant)
  elseif a.kind == "dust" then Gx.dust(a.x, a.y or FLOOR, a.t or 0, a.a or 1, a.col)
  elseif a.draw then a.draw(a, sc) end
end

function Wd.drawWorld()
  local sc = Wd.sc
  local def = sc.def
  local cx = math.floor(Wd.camx)
  local sx, sy = 0, 0
  if Wd.shakeT > 0 then
    sx = love.math.random(-Wd.shakeA, Wd.shakeA)
    sy = love.math.random(-Wd.shakeA, Wd.shakeA)
  end
  if G.flags.tremble and not def.custom and G.settings.shake then sx = sx + love.math.random(-1, 1) end
  Wd.drawOffX, Wd.drawOffY = sx, sy
  lg.clear(P.black[1], P.black[2], P.black[3], 1)
  if def.custom then
    lg.push()
    lg.translate(sx, sy)
    def.drawCustom(sc)
    lg.pop()
    return
  end
  if def.far then
    lg.push()
    lg.translate(-math.floor(cx * (def.farK or 0.5)) + sx, sy)
    def.far(sc)
    lg.pop()
  end
  lg.push()
  lg.translate(-cx + sx, sy)
  if sc.canvas then
    lg.setColor(1, 1, 1, 1)
    lg.draw(sc.canvas, 0, 0)
  end
  Fx.drawPuddles()
  Fx.drawVents()
  if def.draw then def.draw(sc) end
  Wd.drawMarks()
  for _, o in ipairs(Wd.objects()) do
    if o.draw then o.draw(o, sc) end
  end
  for _, a in pairs(sc.actors) do if a.behind then Wd.drawActor(a, sc) end end
  local p, l = Wd.player, Wd.leha
  Fx.drawCastShadows(sc)
  -- контактные тени
  local sink = def.sink or 0
  if not def.noShadow then
    for _, e in ipairs({ p, l.visible and l or nil }) do
      if e and not e.hiddenSprite then
        Gx.r(P.black, e.x - 8, FLOOR - 1 + sink, 16, 2, 0.45)
        Gx.r(P.black, e.x - 5, FLOOR + 1 + sink, 10, 1, 0.3)
      end
    end
  end
  Wd.drawParticles()
  Fx.drawSparks()
  local function drawLeha()
    if l.visible then
      Gx.leha(l.x, FLOOR + (def.sink or 0), { facing = l.facing, frame = l.frame, pose = l.pose, eyesRed = l.eyesRed })
    end
  end
  local function drawDima()
    if p.hiddenSprite then return end
    Gx.dima(p.x, FLOOR + (def.sink or 0), { facing = p.facing, frame = p.frame, pose = p.pose, lampOn = G.light })
  end
  if def.charsDraw then def.charsDraw(sc, drawDima, drawLeha) else
    drawLeha()
    drawDima()
  end
  for _, a in pairs(sc.actors) do if not a.behind then Wd.drawActor(a, sc) end end
  for _, e in ipairs(sc.enemies) do
    if e.kind == "nameless" then Fx.drawTrail(e, sc) end
    Wd.drawActor(e, sc)
  end
  if def.front then def.front(sc) end
  if Wd.underground() then
    if not def.noFog then Wd.drawFog() end
    if not def.noDeco then Gx.frontDeco(sc, Wd.camx) end
  end
  lg.pop()
end

-------------------------------------------------------------- свет
function Wd.lightData()
  local sc = Wd.sc
  local def = sc.def
  local cx = Wd.camx
  local lights = {}
  local function add(x, y, r, col, k)
    if #lights < 14 then lights[#lights + 1] = { x - cx + Wd.drawOffX, y + Wd.drawOffY, r, col[1] * k, col[2] * k, col[3] * k } end
  end
  if def.lights then
    for _, L in ipairs(def.lights(sc) or {}) do add(L[1], L[2], L[3], L[4] or P.orange2, L[5] or 1) end
  end
  Fx.lights(function(x, y, r, col, k) add(x, y, r, col, k) end)
  local worldLights = {}
  Wd.lastLights = worldLights
  for _, L in ipairs(lights) do worldLights[#worldLights + 1] = { L[1] + cx - Wd.drawOffX, L[2] - Wd.drawOffY, L[3] } end
  for _, a in pairs(sc.actors) do
    if a.glow and a.visible ~= false then add(a.x, (a.y or FLOOR) - (a.gy or 30), a.glowR or 60, a.glowCol or P.violet2, a.glow * (a.a or 1)) end
  end
  for _, e in ipairs(sc.enemies) do
    -- враги чуть видны в темноте: серые Безымянные, красноватый Проповедник
    if e.kind == "preacher" then add(e.x, FLOOR - 40, 46, P.red2, 0.22)
    else add(e.x, FLOOR - 30, 36, P.gray4, 0.22) end
  end
  if not def.custom then
    -- слабое свечение вокруг героев, чтобы силуэт читался
    add(Wd.player.x, FLOOR - 24, 26, P.blue3, 0.12)
    if G.light and G.battery > 0 then
      -- рассеянный свет налобного фонаря на самих героях
      add(Wd.player.x + Wd.player.facing * 8, FLOOR - 28, 46, P.orange2, 0.3)
    end
  end
  local amb = sc.ambient or def.ambient or { 0.05, P.blue2 }
  local cone = nil
  if G.light and not def.custom and G.battery > 0 then
    local p = Wd.player
    local hx = p.x + p.facing * 4
    local hy = FLOOR - 43 + (p.pose == "inspect" and 2 or 0)
    local mx, my = UI.mouseWorldX(), UI.mouseWorldY()
    local dx, dy = p.facing, 0.12
    if mx then
      dx, dy = mx - hx, my - hy
      if dx * p.facing < 4 then dx = 4 * p.facing end
    end
    local len = math.sqrt(dx * dx + dy * dy)
    dx, dy = dx / len, dy / len
    local k = 1
    if G.battery < 0.12 then k = (love.math.random() < 0.12) and 0.25 or 0.75 end
    if sc.flicker or Wd.spiritNear() then
      if love.math.random() < 0.1 then k = k * 0.2 end
    end
    cone = { hx - cx + Wd.drawOffX, hy + Wd.drawOffY, dx, dy, G.dim and 140 or 240, G.dim and 0.36 or 0.52, k * (G.dim and 0.7 or 1) }
    Wd.coneWorld = { hx, hy, dx, dy, G.dim and 140 or 240, G.dim and 0.36 or 0.52 }
  else
    Wd.coneWorld = nil
  end
  return lights, cone, amb
end

-- Попадает ли точка (в мире) в конус фонаря?
function Wd.inCone(x, y)
  local c = Wd.coneWorld
  if not c then return false end
  local vx, vy = x - c[1], y - c[2]
  local d = math.sqrt(vx * vx + vy * vy)
  if d > c[5] or d < 1 then return false end
  local cosA = (vx * c[3] + vy * c[4]) / d
  return cosA > math.cos(c[6])
end

function Wd.spiritNear()
  local sc = Wd.sc
  for _, a in pairs(sc.actors) do
    if a.spirit and a.visible ~= false and math.abs(a.x - Wd.player.x) < 130 then return true end
  end
  for _, e in ipairs(sc.enemies) do
    if math.abs(e.x - Wd.player.x) < 130 then return true end
  end
  return false
end

-------------------------------------------------------------- враги
-- Безымянные: рывками, на шум и свет. Проповедник: свет не важен.
function Wd.updateEnemies(dt, opts)
  local sc = Wd.sc
  local p = Wd.player
  opts = opts or {}
  for _, e in ipairs(sc.enemies) do
    e.jt = (e.jt or 0) - dt
    local hidden = Wd.isHidden(e.kind, e.x)
    local range = e.kind == "nameless" and ((G.light and 230 or 120) * (State.has("skull") and 1.5 or 1)) or 150
    local dx = p.x - e.x
    local chasing = (not hidden) and math.abs(dx) < range
    e.chasing = chasing
    local speed = e.speed or 20
    if chasing then speed = speed * (e.kind == "nameless" and 1.6 or 1.2) * (State.has("skull") and 1.3 or 1) end
    local dir = chasing and U.sign(dx) or e.dir
    e.facing = dir
    if e.kind == "nameless" then
      Fx.trail(e, dt)
      -- движение рывками
      if e.jt <= 0 then
        e.jt = 0.25 + love.math.random() * 0.35
        e.burst = 0.12
      end
      if e.burst and e.burst > 0 then
        e.burst = e.burst - dt
        e.x = e.x + dir * speed * dt * 3.2
      end
    else
      -- Проповедник: если замер и не смотришь на него — перестаёт преследовать и идёт мимо
      e.x = e.x + dir * speed * dt
    end
    if e.minX and e.x < e.minX then e.x = e.minX e.dir = 1 end
    if e.maxX and e.x > e.maxX then e.x = e.maxX e.dir = -1 end
    -- стирают метки мелом
    local marks = G.marks[Wd.sceneId]
    for i = #marks, 1, -1 do
      if math.abs(marks[i].x - e.x) < 6 and love.math.random() < 0.02 then table.remove(marks, i) end
    end
    if not hidden and math.abs(dx) < 9 and not opts.noTouch then
      if opts.onTouch then opts.onTouch(e) end
      return true
    end
  end
  return false
end

return Wd
