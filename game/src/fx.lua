-- Визуальные эффекты мира: отбрасываемые тени, лужи с бликами, вспышка фотоаппарата,
-- искры, пар изо рта, следы духов, мусор и детали на стенах.
local Fx = { puddles = {}, flash = 0, sparks = {}, trails = {} }
local lg = love.graphics
local floor = math.floor
local hash = function(a, b) return Gx.hash(a, b) end

-------------------------------------------------------------- статичные детали (рисуются в фон сцены)
local function freeAt(sc, x, pad)
  for _, o in ipairs(sc.def.objects or {}) do
    if o.x and x > o.x - (pad or 18) and x < o.x + (o.w or 20) + (pad or 18) then return false end
  end
  return x > 30 and x < sc.w - 30
end

local function crate(x, y)
  Gx.r(P.brown1, x, y - 12, 16, 12)
  Gx.r(P.brown2, x, y - 12, 16, 2)
  Gx.r(P.brown2, x + 1, y - 9, 14, 1)
  Gx.r(P.brown2, x + 1, y - 5, 14, 1)
  Gx.line(P.black, x + 1, y - 10, x + 14, y - 2, 0.4)
  Gx.r(P.black, x, y - 1, 16, 1, 0.5)
end

local function debris(x, y, seed)
  for k = 0, 6 do
    local dx = hash(seed, k) * 18 - 9
    local w = 2 + floor(hash(k, seed) * 4)
    local col = hash(seed + k, 3) > 0.5 and P.gray2 or P.rust
    Gx.r(col, x + dx, y - 1 - floor(hash(k, seed + 1) * 3), w, 2)
    Gx.r(P.white, x + dx, y - 1 - floor(hash(k, seed + 1) * 3), w, 1, 0.12)
  end
  Gx.r(P.black, x - 10, y, 22, 1, 0.4)
end

local function papers(x, y, seed)
  for k = 0, 3 do
    local dx = hash(seed, k + 9) * 20 - 10
    Gx.r(P.cream2, x + dx, y - 1 + k % 2, 5, 2, 0.8)
    Gx.r(P.gray2, x + dx + 1, y - 1 + k % 2, 3, 1, 0.6)
  end
end

local function bottle(x, y)
  Gx.r(P.green2, x, y - 2, 7, 2)
  Gx.r(P.green3, x + 7, y - 2, 2, 1)
  Gx.r(P.white, x + 1, y - 2, 3, 1, 0.3)
end

local function bucket(x, y)
  Gx.r(P.gray1, x, y - 9, 10, 9)
  Gx.r(P.gray2, x - 1, y - 10, 12, 2)
  Gx.r(P.rust, x + 2, y - 6, 2, 5, 0.6)
  Gx.line(P.gray2, x, y - 10, x + 5, y - 15)
  Gx.line(P.gray2, x + 10, y - 10, x + 5, y - 15)
end

local function cableCoil(x, y)
  for r = 6, 3, -1 do
    lg.setColor(P.black[1], P.black[2], P.black[3], 1)
    lg.ellipse("line", x, y - 2, r + 2, r / 2)
  end
  Gx.r(P.dk2, x - 7, y - 3, 14, 1, 0.6)
end

local function elBox(x, y)
  Gx.r(P.gray1, x, y, 18, 22)
  Gx.r(P.gray2, x, y, 18, 1)
  Gx.r(P.black, x + 17, y, 1, 22, 0.5)
  Gx.r(P.dk2, x + 3, y + 4, 12, 8)
  Gx.r(P.yellow, x + 6, y + 15, 6, 4, 0.6)
  Gx.r(P.black, x + 8, y + 16, 2, 2)
  Gx.r(P.rust, x + 2, y + 21, 14, 3, 0.4)
  Gx.r(P.black, x + 8, y + 22, 2, 30)
end

local function pipeWithValve(x, y, len)
  Gx.r(P.gray1, x, y, len, 4)
  Gx.r(P.gray2, x, y, len, 1)
  Gx.r(P.black, x, y + 3, len, 1, 0.5)
  for k = 0, len, 40 do Gx.r(P.dk1, x + k, y - 1, 3, 6) end
  local vx = x + floor(len * 0.6)
  Gx.r(P.red1, vx - 4, y - 7, 10, 2)
  Gx.r(P.dk1, vx, y - 5, 2, 5)
  Gx.r(P.rust, x + 6, y + 4, 1, 14, 0.5)
end

local function tornPoster(x, y, seed)
  Gx.r(P.cream2, x, y, 22, 28, 0.85)
  Gx.r(P.red1, x + 2, y + 2, 18, 6, 0.7)
  for k = 0, 3 do Gx.r(P.gray2, x + 3, y + 12 + k * 4, 12 + k % 2 * 4, 1, 0.6) end
  -- оборванный угол
  Gx.line(P.dk2, x + 13, y + 28, x + 22, y + 18, 0.8)
  Gx.r(P.black, x + 14, y + 20, 8, 8, 0.6)
end

function Fx.decorate(sc)
  local def = sc.def
  if def.props == false then return end
  local seed = #sc.id * 13 + sc.w
  -- мусор у пола
  local x = 40 + hash(seed, 1) * 60
  local i = 0
  while x < sc.w - 40 do
    i = i + 1
    if freeAt(sc, x) and hash(seed, i + 100) < 0.55 then
      local kind = floor(hash(i, seed) * 6)
      local y = FLOOR - 2 - floor(hash(i, seed + 2) * 4)
      if kind == 0 then debris(x, y, i + seed)
      elseif kind == 1 then papers(x, y + 2, i + seed)
      elseif kind == 2 then bottle(x, y)
      elseif kind == 3 and def.props ~= "light" then crate(x, y)
      elseif kind == 4 then bucket(x, y)
      else cableCoil(x, y) end
    end
    x = x + 55 + hash(i, seed + 5) * 90
  end
  if def.wallProps == false then return end
  -- детали на стенах
  local top = def.wallTop or 70
  x = 60 + hash(seed, 7) * 80
  i = 0
  while x < sc.w - 60 do
    i = i + 1
    if freeAt(sc, x, 30) then
      local r = hash(i + 50, seed)
      if r < 0.25 then elBox(x, top + 40 + floor(hash(i, 4) * 20))
      elseif r < 0.45 then pipeWithValve(x - 30, top + 10 + floor(hash(i, 5) * 20), 80 + floor(hash(i, 6) * 60))
      elseif r < 0.6 then tornPoster(x, top + 30 + floor(hash(i, 7) * 20), i)
      end
    end
    x = x + 110 + hash(i, seed + 9) * 140
  end
end

-------------------------------------------------------------- лужи
function Fx.makePuddles(sc)
  Fx.vents = {}
  if sc.def.vents ~= false then
    local seed = #sc.id * 3 + sc.w
    local x = 120 + Gx.hash(seed, 1) * 140
    local i = 0
    while x < sc.w - 60 do
      i = i + 1
      Fx.vents[#Fx.vents + 1] = { x = math.floor(x), ph = Gx.hash(i, seed) * 6 }
      x = x + 300 + Gx.hash(i, seed + 2) * 200
    end
  end
  Fx.puddles = {}
  if sc.def.puddles == false or sc.def.custom then return end
  local seed = #sc.id * 7 + sc.w
  local n = floor(sc.w / 160)
  for i = 1, n do
    local x = hash(seed, i) * (sc.w - 60) + 30
    Fx.puddles[i] = { x = x, y = FLOOR + 6 + floor(hash(i, seed) * 18), w = 14 + floor(hash(seed + i, 3) * 30) }
  end
end

function Fx.drawPuddles()
  for _, p in ipairs(Fx.puddles) do
    Gx.r(P.water, p.x - p.w / 2 + 2, p.y, p.w - 4, 1, 0.9)
    Gx.r(P.water, p.x - p.w / 2, p.y + 1, p.w, 2, 0.9)
    Gx.r(P.water, p.x - p.w / 2 + 3, p.y + 3, p.w - 6, 1, 0.9)
    Gx.r(P.blue2, p.x - p.w / 2 + 2, p.y + 1, p.w / 3, 1, 0.4)
  end
end

-- Блики фонаря и свечей в лужах (после освещения)
function Fx.drawGlints(camx)
  local c = World.coneWorld
  local t = love.timer.getTime()
  for _, p in ipairs(Fx.puddles) do
    local k = 0
    if c then
      local vx, vy = p.x - c[1], p.y - c[2]
      local d = math.sqrt(vx * vx + vy * vy)
      if d < c[5] and d > 2 then
        local cs = (vx * c[3] + vy * c[4]) / d
        local e = math.cos(c[6] * 1.3)
        if cs > e then k = math.min(1, (cs - e) * 6) * (1 - d / c[5]) end
      end
    end
    for _, L in ipairs(World.lastLights or {}) do
      local d = math.abs(p.x - L[1])
      if d < L[3] then k = math.max(k, (1 - d / L[3]) * 0.6) end
    end
    if k > 0.05 then
      local x0 = p.x - camx
      for s = 0, 2 do
        local wob = math.sin(t * 3 + s * 2 + p.x) * 2
        Gx.r(P.cream, x0 - p.w / 4 + wob + s * 3, p.y + 1 + s % 2, p.w / 2 - s * 4, 1, k * (0.7 - s * 0.2))
      end
    end
  end
end

-------------------------------------------------------------- отбрасываемые тени на стене
-- Каждый «отбрасыватель» рисуется чёрным силуэтом, растянутым от ближайшего источника.
local function shadowOf(drawFn, x, lx, alpha)
  local off = U.clamp((x - lx) * 0.55, -70, 70)
  local sx = 1 + math.abs(off) / 160
  lg.push()
  lg.translate(x + off, FLOOR - 6)
  lg.scale(sx, 1.3)
  lg.translate(-x, -FLOOR)
  Gx.override = P.black
  Gx.overrideA = alpha
  drawFn()
  Gx.override = nil
  Gx.overrideA = nil
  lg.pop()
end

function Fx.drawCastShadows(sc)
  if sc.def.noCastShadows then return end
  local casters = {}
  local l = World.leha
  if l.visible then
    casters[#casters + 1] = { x = l.x, fn = function() Gx.leha(l.x, FLOOR, { facing = l.facing, frame = l.frame, pose = l.pose, noOutline = true }) end, cone = true }
  end
  local p = World.player
  casters[#casters + 1] = { x = p.x, fn = function() Gx.dima(p.x, FLOOR, { facing = p.facing, frame = p.frame, pose = p.pose, noOutline = true }) end }
  for _, e in ipairs(sc.enemies) do
    casters[#casters + 1] = { x = e.x, fn = function() World.drawActor(e, sc) end, cone = true, big = e.kind == "preacher" }
  end
  for _, a in pairs(sc.actors) do
    if a.kind == "preacher" or a.kind == "nameless" then
      casters[#casters + 1] = { x = a.x, fn = function() World.drawActor(a, sc) end, cone = true, big = true }
    end
  end
  local c = World.coneWorld
  local lights = World.lastLights or {}
  for _, cs in ipairs(casters) do
    -- от фонаря Димы
    if c and cs.cone and World.inCone(cs.x, FLOOR - 24) then
      local d = math.abs(cs.x - c[1])
      shadowOf(cs.fn, cs.x, c[1], 0.55 * (1 - d / c[5]) + (cs.big and 0.15 or 0))
    end
    -- от свечей и ламп
    for _, L in ipairs(lights) do
      local d = math.abs(cs.x - L[1])
      if d < L[3] * 0.9 and d > 4 then shadowOf(cs.fn, cs.x, L[1], 0.45 * (1 - d / L[3])) end
    end
  end
end

-------------------------------------------------------------- вспышка фотоаппарата Лёхи (Акты 1–2)
function Fx.updateFlash(sc, dt)
  if Fx.flash > 0 then Fx.flash = math.max(0, Fx.flash - dt) end
  if sc.def.custom or not World.leha.visible or (G.act or 1) > 2 or not World.underground() then return end
  sc.flashT = (sc.flashT or (30 + love.math.random() * 40)) - dt
  if sc.flashT <= 0 and not Script.blocking() and not Dialog.active() then
    sc.flashT = 45 + love.math.random() * 50
    Fx.flash = 0.18
    Audio.play("click", 0.6, 1.8, World.leha.x)
    World.leha.pose = "inspect"
  end
end

-------------------------------------------------------------- искры с оборванных кабелей
function Fx.updateSparks(sc, dt)
  for i = #Fx.sparks, 1, -1 do
    local s = Fx.sparks[i]
    s.t = s.t + dt
    for _, q in ipairs(s.bits) do
      q.vy = q.vy + 300 * dt
      q.x = q.x + q.vx * dt
      q.y = q.y + q.vy * dt
    end
    if s.t > 1.2 then table.remove(Fx.sparks, i) end
  end
  if not World.underground() or sc.def.sparks == false then return end
  sc.sparkT = (sc.sparkT or (12 + love.math.random() * 20)) - dt
  if sc.sparkT <= 0 then
    sc.sparkT = 25 + love.math.random() * 35
    local x = World.camx + 40 + love.math.random() * (W - 80)
    local s = { x = x, y = 12, t = 0, bits = {} }
    for k = 1, 9 do
      s.bits[k] = { x = x, y = 12, vx = (love.math.random() - 0.5) * 70, vy = love.math.random() * 40 }
    end
    Fx.sparks[#Fx.sparks + 1] = s
    Audio.play("crack", 0.25, 2.2, x)
    Audio.play("click", 0.4, 0.7, x)
  end
end

function Fx.drawSparks()
  for _, s in ipairs(Fx.sparks) do
    for _, q in ipairs(s.bits) do
      if q.y < FLOOR + 6 then Gx.r(s.t < 0.4 and P.white or P.yellow, q.x, q.y, 1, 2, math.max(0, 1 - s.t)) end
    end
  end
end

-------------------------------------------------------------- пар изо рта
function Fx.updateBreath(sc, dt, parts)
  if not sc.def.cold then return end
  for _, e in ipairs({ World.player, World.leha }) do
    if e == World.player or World.leha.visible then
      e.breathT = (e.breathT or love.math.random() * 2) - dt
      if e.breathT <= 0 then
        e.breathT = 2.2 + love.math.random() * 1.2
        if not (e == World.player and e.frozen) then
          parts[#parts + 1] = { kind = "breath", x = e.x + e.facing * 7, y = FLOOR - 38 + (sc.def.sink or 0), vx = e.facing * 6, t = 0 }
        end
      end
    end
  end
end

-------------------------------------------------------------- вентрешётки в потолке и холодные столбы света
function Fx.drawVents()
  for _, v in ipairs(Fx.vents or {}) do
    Gx.r(P.dk1, v.x - 9, 0, 18, 6)
    for k = 0, 4 do Gx.r(P.gray2, v.x - 8 + k * 4, 1, 2, 4) end
    Gx.r(P.gray3, v.x - 9, 5, 18, 1)
  end
end

local function ventK(v, t)
  return 0.85 + 0.15 * math.sin(t * 0.7 + v.ph)
end

function Fx.drawShafts(camx)
  local t = love.timer.getTime()
  for _, v in ipairs(Fx.vents or {}) do
    local x0 = v.x - camx
    if x0 > -80 and x0 < W + 80 then
      local k = ventK(v, t)
      for y = 6, FLOOR, 2 do
        local f = (y - 6) / (FLOOR - 6)
        local half = 7 + f * 26
        local a = 0.16 * (1 - f * 0.75) * k
        for xx = -half, half, 2 do
          local edge = 1 - math.abs(xx) / half
          if Gx.hash(math.floor(x0 + xx), y) < edge then
            Gx.px(P.blue3, x0 + xx + (y / 2 % 2), y, a)
          end
        end
      end
    end
  end
end

-------------------------------------------------------------- свет от эффектов
function Fx.lights(add)
  local t = love.timer.getTime()
  for _, v in ipairs(Fx.vents or {}) do
    if math.abs(v.x - World.camx - W / 2) < W then add(v.x, 60, 130, P.blue3, 0.22 * ventK(v, t)) end
  end
  if Fx.flash > 0 then
    add(World.leha.x, FLOOR - 30, 520, P.white, 2.6 * Fx.flash / 0.18)
  end
  for _, s in ipairs(Fx.sparks) do
    if s.t < 0.5 then add(s.x, 20, 70, P.yellow, (0.5 - s.t) * 2) end
  end
end

-------------------------------------------------------------- следы духов
function Fx.spiritAura(a, sc)
  if Gx.override then return end
  local t = sc.t
  if a.kind == "evd" or a.kind == "alesha" or a.kind == "fig" then
    local col = a.kind == "alesha" and P.blue3 or P.orange2
    for i = 1, 8 do
      local ph = (t * 0.35 + i / 8) % 1
      local x = a.x + math.sin(t * 0.8 + i * 1.7) * (8 + i)
      local y = (a.y or FLOOR) - 10 - ph * 50
      Gx.px(col, x, y, (a.a or 1) * (1 - ph) * 0.9)
    end
  elseif a.kind == "preacher" then
    for i = 1, 12 do
      local ph = (t * 0.5 + i / 12) % 1
      local x = a.x + (Gx.hash(i, 3) - 0.5) * 30 + math.sin(t + i) * 3
      local y = (a.y or FLOOR) - ph * 26
      Gx.r(P.black, x, y, 2, 2, (a.a or 1) * (1 - ph) * 0.7)
    end
  end
end

-- Безымянные оставляют за собой полупрозрачные остаточные силуэты
function Fx.trail(e, dt)
  e.trail = e.trail or {}
  e.trailT = (e.trailT or 0) - dt
  if e.trailT <= 0 then
    e.trailT = 0.09
    table.insert(e.trail, 1, e.x)
    if #e.trail > 4 then table.remove(e.trail) end
  end
end

function Fx.drawTrail(e, sc)
  if not e.trail then return end
  for i, x in ipairs(e.trail) do
    if math.abs(x - e.x) > 1 then
      Gx.nameless(x, FLOOR, sc.t - i * 0.05, (e.a or 1) * 0.18 / i, e.variant)
    end
  end
end

return Fx
