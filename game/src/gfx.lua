-- Пиксельная отрисовка: примитивы, персонажи, духи и типовой реквизит
local Gx = {}
local lg = love.graphics
local floor = math.floor

function Gx.c(col, a) lg.setColor(col[1], col[2], col[3], a or 1) end

-- Gx.override: временная подмена цвета (для контура спрайтов)
function Gx.r(col, x, y, w, h, a)
  local o = Gx.override
  if o then
    lg.setColor(o[1], o[2], o[3], (a or 1) * (Gx.overrideA or 1))
  else
    lg.setColor(col[1], col[2], col[3], a or 1)
  end
  lg.rectangle("fill", floor(x), floor(y), w, h)
end

function Gx.px(col, x, y, a) Gx.r(col, x, y, 1, 1, a) end

function Gx.line(col, x1, y1, x2, y2, a)
  -- пиксельная линия (Брезенхем)
  x1, y1, x2, y2 = floor(x1), floor(y1), floor(x2), floor(y2)
  lg.setColor(col[1], col[2], col[3], a or 1)
  local dx, dy = math.abs(x2 - x1), -math.abs(y2 - y1)
  local sx, sy = x1 < x2 and 1 or -1, y1 < y2 and 1 or -1
  local err = dx + dy
  local n = 0
  while n < 2000 do
    lg.rectangle("fill", x1, y1, 1, 1)
    if x1 == x2 and y1 == y2 then break end
    local e2 = 2 * err
    if e2 >= dy then err = err + dy x1 = x1 + sx end
    if e2 <= dx then err = err + dx y1 = y1 + sy end
    n = n + 1
  end
end

-- Шрифты: в мире — пиксельные 1:1, в интерфейсе — в полном разрешении окна
Gx.world = false

function Gx.F(font)
  if Gx.world then
    if font == Fonts.big or font == Fonts.wbig then return Fonts.wbig end
    return Fonts.wsmall
  end
  return font or Fonts.small
end

function Gx.print(font, s, x, y)
  local f = Gx.F(font)
  lg.setFont(f.f)
  lg.print(s, floor(x), floor(y), 0, f.s, f.s)
end

function Gx.text(s, x, y, col, a, font)
  lg.setColor(col[1], col[2], col[3], a or 1)
  Gx.print(font, s, x, y)
end

function Gx.textc(s, cx, y, col, a, font)
  local f = Gx.F(font)
  lg.setColor(col[1], col[2], col[3], a or 1)
  Gx.print(f, s, cx - f:getWidth(s) / 2, y)
end

-- Текст с тёмной обводкой
function Gx.textO(s, x, y, col, a, font)
  local f = Gx.F(font)
  local o = Gx.world and 1 or 0.5
  lg.setColor(0, 0, 0, (a or 1) * 0.85)
  for _, d in ipairs({ { -o, 0 }, { o, 0 }, { 0, -o }, { 0, o } }) do
    lg.setFont(f.f)
    lg.print(s, floor(x) + d[1], floor(y) + d[2], 0, f.s, f.s)
  end
  lg.setColor(col[1], col[2], col[3], a or 1)
  Gx.print(f, s, x, y)
end

function Gx.textOc(s, cx, y, col, a, font)
  local f = Gx.F(font)
  Gx.textO(s, cx - f:getWidth(s) / 2, y, col, a, f)
end

-- Детерминированный «шум» для узоров
function Gx.hash(x, y)
  local n = math.sin(x * 12.9898 + y * 78.233) * 43758.5453
  return n - floor(n)
end

-------------------------------------------------------------- стены и полы
-- Плитка: ряд прямоугольников с затиркой
function Gx.tiles(x, y, w, h, tw, th, col, grout, wear)
  Gx.r(grout, x, y, w, h)
  for ty = 0, h - 1, th do
    local off = (floor(ty / th) % 2 == 0) and 0 or 0
    for tx = 0, w - 1, tw do
      local hx = Gx.hash(x + tx, y + ty)
      local cc = col
      local a = 1
      if wear and hx < wear then a = 0.55 end
      local ww = math.min(tw - 1, w - tx)
      local hh = math.min(th - 1, h - ty)
      if ww > 0 and hh > 0 then
        Gx.r(cc, x + tx + off, y + ty, ww, hh, a)
        -- фаска: блик сверху-слева, тень снизу
        Gx.r(P.white, x + tx, y + ty, ww, 1, 0.13 * a)
        Gx.r(P.white, x + tx, y + ty, 1, hh, 0.07 * a)
        if hh > 2 then Gx.r(P.black, x + tx, y + ty + hh - 1, ww, 1, 0.18) end
        if hx > 0.85 then Gx.px(grout, x + tx + 2, y + ty + 1, 0.6) end
        if hx < 0.04 then Gx.line(grout, x + tx + 1, y + ty + 1, x + tx + ww - 2, y + ty + hh - 1, 0.8) end
      end
    end
  end
end

function Gx.bricks(x, y, w, h, col, mortar, col2)
  Gx.r(mortar, x, y, w, h)
  local bw, bh = 12, 5
  local row = 0
  for by = 0, h - 1, bh do
    local off = (row % 2) * 6
    for bx = -off, w - 1, bw do
      local hx = Gx.hash(x + bx, y + by)
      local cc = (col2 and hx > 0.6) and col2 or col
      local x0 = math.max(bx, 0)
      local x1 = math.min(bx + bw - 1, w)
      if x1 > x0 then
        local bhh = math.min(bh - 1, h - by)
        Gx.r(cc, x + x0, y + by, x1 - x0, bhh)
        Gx.r(P.white, x + x0, y + by, x1 - x0, 1, 0.1)
        if bhh > 2 then Gx.r(P.black, x + x0, y + by + bhh - 1, x1 - x0, 1, 0.22) end
        if hx > 0.9 then Gx.r(P.black, x + x0 + 3, y + by + 1, 2, 2, 0.25) end
      end
    end
    row = row + 1
  end
end

function Gx.concrete(x, y, w, h, col, col2, seed)
  Gx.r(col, x, y, w, h)
  seed = seed or 0
  for i = 0, floor(w * h / 40) do
    local hx = Gx.hash(i + seed, 3.1)
    local hy = Gx.hash(i + seed, 7.7)
    Gx.px(col2, x + hx * w, y + hy * h, 0.6)
  end
end

-- Пятна сырости / соли
function Gx.stain(cx, cy, rw, rh, col, a, seed)
  for i = 0, floor(rw * rh / 3) do
    local hx = Gx.hash(i + (seed or 0), 1.3) * 2 - 1
    local hy = Gx.hash(i + (seed or 0), 9.1) * 2 - 1
    if hx * hx + hy * hy < 1 then Gx.px(col, cx + hx * rw, cy + hy * rh, a) end
  end
end

-- Рельсы на переднем плане (полоса пути)
function Gx.rails(x, y, w)
  Gx.r(P.dk1, x, y, w, 10)
  for sx = x, x + w, 14 do Gx.r(P.brown1, sx, y + 3, 8, 6) end
  Gx.r(P.rust, x, y + 1, w, 2)
  Gx.r(P.gray2, x, y + 1, w, 1, 0.5)
end

function Gx.cableTray(x, y, w)
  Gx.r(P.gray1, x, y, w, 2)
  for sx = x, x + w, 24 do Gx.r(P.dk2, sx, y, 2, 8) end
end

function Gx.cagedLamp(x, y, lit)
  Gx.r(P.dk2, x - 3, y, 7, 2)
  Gx.r(lit and P.yellow or P.gray1, x - 2, y + 2, 5, 5)
  Gx.r(P.dk1, x - 3, y + 3, 7, 1)
  Gx.r(P.dk1, x, y + 2, 1, 6)
end

function Gx.door(x, y, w, h, col, open)
  Gx.r(P.black, x, y, w, h)
  Gx.r(P.dk1, x - 2, y - 2, w + 4, 2)
  Gx.r(P.dk1, x - 2, y, 2, h)
  Gx.r(P.dk1, x + w, y, 2, h)
  if open then
    Gx.r(col, x + w - 4, y, 4, h)
  else
    Gx.r(col, x, y, w, h)
    Gx.r(P.dk1, x + 2, y + 2, w - 4, 1, 0.5)
    Gx.px(P.gray3, x + w - 4, y + h / 2)
  end
end

function Gx.bench(x, y, wood)
  wood = wood or P.brown2
  Gx.r(wood, x, y - 12, 34, 3)
  Gx.r(wood, x, y - 20, 34, 2)
  Gx.r(P.dk1, x + 2, y - 9, 2, 9)
  Gx.r(P.dk1, x + 30, y - 9, 2, 9)
  Gx.r(P.dk1, x + 2, y - 20, 1, 8)
  Gx.r(P.dk1, x + 31, y - 20, 1, 8)
end

function Gx.clock(cx, cy, hh, mm, r)
  r = r or 7
  lg.setColor(P.dk1)
  lg.circle("fill", cx, cy, r + 2)
  lg.setColor(P.white)
  lg.circle("fill", cx, cy, r)
  for k = 0, 11 do
    local a = k / 12 * math.pi * 2
    Gx.px(P.dk1, cx + math.sin(a) * (r - 1), cy - math.cos(a) * (r - 1))
  end
  local am = mm / 60 * math.pi * 2
  local ah = ((hh % 12) + mm / 60) / 12 * math.pi * 2
  Gx.line(P.black, cx, cy, cx + math.sin(am) * (r - 2), cy - math.cos(am) * (r - 2))
  Gx.line(P.black, cx, cy, cx + math.sin(ah) * (r - 4), cy - math.cos(ah) * (r - 4))
end

-- Лошадка на колёсиках
function Gx.horse(x, y, a)
  a = a or 1
  Gx.r(P.brown2, x, y - 6, 9, 3, a)
  Gx.r(P.brown2, x + 7, y - 10, 3, 5, a)
  Gx.r(P.brown2, x + 8, y - 11, 4, 2, a)
  Gx.r(P.brown1, x - 1, y - 6, 1, 2, a)
  Gx.r(P.brown1, x + 1, y - 3, 1, 2, a)
  Gx.r(P.brown1, x + 7, y - 3, 1, 2, a)
  Gx.r(P.dk2, x - 1, y - 2, 12, 1, a)
  Gx.px(P.gray2, x + 1, y - 1, a)
  Gx.px(P.gray2, x + 8, y - 1, a)
  Gx.px(P.cream2, x + 3, y - 5, a)
end

function Gx.candle(x, y, t, lit)
  Gx.r(P.cream, x - 1, y - 6, 3, 6)
  if lit then
    local fl = math.sin(t * 13 + x) > 0 and 1 or 0
    Gx.px(P.orange2, x, y - 8 - fl)
    Gx.px(P.yellow, x, y - 7)
    Gx.px(P.orange1, x + (fl == 1 and 1 or -1), y - 8, 0.6)
  end
end

function Gx.skeleton(x, y, sitting, jacket)
  if sitting then
    Gx.r(jacket or P.dk2, x - 5, y - 20, 10, 12)
    Gx.r(P.bone, x - 3, y - 27, 7, 6)
    Gx.px(P.black, x - 2, y - 25) Gx.px(P.black, x + 1, y - 25)
    Gx.r(P.dk1, x - 4, y - 8, 14, 3)
    Gx.r(P.bone, x + 8, y - 8, 4, 2)
    Gx.r(P.bone, x - 7, y - 16, 2, 8)
  else
    Gx.r(jacket or P.dk2, x - 10, y - 7, 14, 6)
    Gx.r(P.dk1, x + 4, y - 5, 12, 3)
    Gx.r(P.bone, x - 16, y - 8, 6, 6)
    Gx.px(P.black, x - 15, y - 6) Gx.px(P.black, x - 13, y - 6)
    Gx.r(P.bone, x + 15, y - 4, 3, 2)
  end
end

-------------------------------------------------------------- грязь, подтёки, трещины
function Gx.grime(sc)
  local w = sc.w
  -- тень под потолком
  for i = 0, 40 do Gx.r(P.black, 0, i, w, 1, 0.45 * (1 - i / 40)) end
  -- подтёки ржавчины и воды
  for i = 1, math.floor(w / 26) do
    local x = math.floor(Gx.hash(i, 401) * w)
    local y0 = 26 + math.floor(Gx.hash(i, 402) * 40)
    local len = 20 + math.floor(Gx.hash(i, 403) * 90)
    local col = Gx.hash(i, 404) > 0.5 and P.rust or P.black
    for k = 0, len do
      local a = 0.22 * (1 - k / len)
      Gx.px(col, x + math.floor(math.sin(k * 0.2 + i) * 0.8), y0 + k, a)
      if k % 3 == 0 then Gx.px(col, x + 1, y0 + k, a * 0.6) end
    end
  end
  -- трещины
  for i = 1, math.floor(w / 90) do
    local x = Gx.hash(i, 411) * w
    local y = 50 + Gx.hash(i, 412) * 120
    for k = 1, 9 do
      local nx = x + (Gx.hash(i * 10 + k, 413) - 0.5) * 10
      local ny = y + 3 + Gx.hash(i * 10 + k, 414) * 6
      Gx.line(P.black, x, y, nx, ny, 0.4)
      if k % 3 == 0 then Gx.line(P.black, nx, ny, nx + 4, ny + 2, 0.3) end
      x, y = nx, ny
    end
  end
  -- копоть у пола
  for i = 0, 14 do Gx.r(P.black, 0, FLOOR - 40 + i, w, 1, 0.012 * i) end
  -- сор на полу
  for i = 1, math.floor(w / 6) do
    local x = Gx.hash(i, 421) * w
    local y = FLOOR - 2 + Gx.hash(i, 422) * 30
    Gx.px(Gx.hash(i, 423) > 0.5 and P.gray2 or P.dk1, x, y, 0.7)
  end
end

-- Передний план под землёй: трубы под сводом и провисшие кабели (параллакс 1.3)
function Gx.frontDeco(sc, camx)
  lg.push()
  lg.translate(-camx * 0.3, 0)
  local w = sc.w * 1.3 + W
  local seed = #sc.id
  Gx.r(P.black, -20, 0, w + 40, 7)
  Gx.r(P.dk1, -20, 6, w + 40, 1)
  for x = -20, w, 64 do Gx.r(P.black, x, 0, 4, 11) end
  for i = 0, math.floor(w / 170) do
    local x0 = i * 170 + Gx.hash(i, seed) * 60
    local span = 70 + Gx.hash(i, seed + 1) * 60
    local sag = 10 + Gx.hash(i, seed + 2) * 14
    for k = 0, span do
      local t = k / span
      Gx.px(P.black, x0 + k, 6 + math.floor(sag * 4 * t * (1 - t)), 1)
    end
  end
  for i = 0, math.floor(w / 400) do
    local x = i * 400 + 120 + Gx.hash(i, seed + 3) * 120
    Gx.r(P.black, x, 0, 9, H)
    Gx.r(P.dk1, x + 1, 0, 1, H, 0.6)
    for y = 30, H, 46 do Gx.r(P.black, x - 2, y, 13, 3) end
  end
  lg.pop()
end

-------------------------------------------------------------- персонажи (32×48, с контуром)
-- Рисует прямоугольник в системе спрайта: dx отсчитывается от центра «лицом вправо»
local SX, SY, SF
local function R(dx, dy, w, h, col, a)
  if SF > 0 then Gx.r(col, SX + dx, SY + dy, w, h, a) else Gx.r(col, SX - dx - w + 1, SY + dy, w, h, a) end
end

local function bodyPass(o, fr, pose, t)
  local a = o.alpha or 1
  local jk, jkD, jkL = o.jacket, o.jacket2, o.jacketL or o.jacket
  local pants, pantsD = o.pants or P.dk2, o.pantsD or P.dk1
  local skin, skinD = P.skin, o.skinD or P.cream2
  local hair = o.hair or P.brown1
  local breathe = (pose == "idle") and ((math.sin(t * 2.2 + (o.seed or 0)) > 0.4) and -1 or 0) or 0

  if pose == "sit" then
    R(-6, -14, 14, 5, pants, a) R(-6, -10, 14, 1, pantsD, a)
    R(5, -10, 4, 9, pants, a) R(5, -2, 6, 2, P.black, a)
    if o.backpack then R(-12, -30, 6, 13, o.backpack, a) end
    R(-7, -31, 14, 18, jk, a) R(-7, -31, 3, 18, jkD, a) R(4, -31, 2, 16, jkL, a)
    R(-1, -31, 1, 16, jkD, a)
    R(2, -24, 5, 4, jkD, a) R(6, -21, 3, 3, skin, a)
    R(-4, -43, 10, 11, skin, a) R(-4, -43, 3, 11, skinD, a)
    R(-5, -44, 11, 4, hair, a) R(-5, -42, 3, 6, hair, a)
    R(3, -38, 1, 1, P.black, a)
    if o.lamp then R(-5, -41, 11, 1, P.dk1, a) R(6, -42, 2, 3, o.lampOn and P.yellow or P.gray2, a) end
    return
  end

  local legB, legF, bob = 0, 0, 0
  if pose == "walk" then
    local cyc = { { -3, 3, 0 }, { -1, 1, -1 }, { 1, -1, 0 }, { 3, -3, 0 }, { 1, -1, -1 }, { -1, 1, 0 } }
    local c = cyc[(fr % 6) + 1]
    legB, legF, bob = c[1], c[2], c[3]
  end
  local dy = bob + breathe
  local lean = 0
  if pose == "inspect" then lean = 2 dy = 2 end
  if pose == "freeze" then dy = 5 end
  if pose == "kneel" then dy = 11 end
  if pose == "fear" then dy = 1 end

  -- ноги
  if pose == "kneel" then
    R(-6, -10, 12, 5, pants, a) R(-6, -6, 12, 1, pantsD, a)
    R(-8, -5, 5, 5, P.black, a)
  elseif pose == "climb" then
    local k = fr % 2
    R(-5, -17, 4, 15 + k * 2, pantsD, a) R(1, -17, 4, 17 - k * 2, pants, a)
    R(-5, -2 + k * 2, 4, 2, P.black, a) R(1, -k * 2, 4, 2, P.black, a)
  else
    local lh = pose == "freeze" and 12 or 16
    -- задняя нога (темнее)
    R(-4 + legB, -lh, 4, lh - 2, pantsD, a)
    R(-5 + legB, -3, 6, 3, P.black, a)
    -- передняя нога
    R(0 + legF, -lh, 4, lh - 2, pants, a)
    R(0 + legF, -lh + 6, 4, 1, pantsD, a)
    R(0 + legF, -3, 6, 3, P.black, a)
    R(1 + legF, -3, 5, 1, P.dk2, a)
  end

  local ty = -34 + dy
  local tx = lean
  -- заднее плечо и рука
  local sw = 0
  if pose == "walk" then sw = ({ 2, 1, 0, -2, -1, 0 })[(fr % 6) + 1] end
  if pose ~= "climb" and pose ~= "inspect" and pose ~= "freeze" then
    R(tx - 6 - sw, ty + 3, 3, 12, jkD, a)
    R(tx - 6 - sw, ty + 15, 3, 2, skinD, a)
  end
  -- рюкзак
  if o.backpack then
    R(tx - 12, ty + 1, 6, 15, o.backpack, a)
    R(tx - 12, ty + 1, 6, 2, P.black, a * 0.3)
    R(tx - 11, ty + 9, 4, 1, P.black, a * 0.5)
  end
  -- куртка
  R(tx - 7, ty, 14, 19, jk, a)
  R(tx - 7, ty, 3, 19, jkD, a)
  R(tx + 4, ty + 1, 2, 15, jkL, a)
  R(tx + 1, ty + 2, 1, 16, jkD, a)
  R(tx - 7, ty + 17, 14, 2, jkD, a)
  R(tx - 5, ty - 1, 10, 2, jkD, a)
  R(tx + 2, ty + 11, 4, 3, jkD, a)
  if o.backpack then
    R(tx - 6, ty + 2, 2, 1, P.black, a * 0.6)
    R(tx - 5, ty + 3, 2, 1, P.black, a * 0.6)
    R(tx - 4, ty + 4, 2, 1, P.black, a * 0.6)
  end
  if o.camera then
    R(tx - 2, ty, 1, 6, P.black, a)
    R(tx + 3, ty + 6, 5, 4, P.black, a)
    R(tx + 6, ty + 7, 2, 2, P.gray3, a)
    R(tx + 4, ty + 6, 1, 1, P.gray2, a)
  end
  if o.recorder then R(tx - 4, ty + 9, 2, 3, P.gray2, a) R(tx - 4, ty + 9, 2, 1, P.red2, a * 0.8) end
  if o.notebook then R(tx + 3, ty + 12, 3, 2, P.cream2, a) end
  -- переднее плечо и рука
  if pose == "climb" then
    local k = fr % 2
    R(tx - 8, ty - 9 + k * 2, 3, 12, jk, a) R(tx - 8, ty - 11 + k * 2, 3, 2, skin, a)
    R(tx + 5, ty - 7 - k * 2, 3, 12, jk, a) R(tx + 5, ty - 9 - k * 2, 3, 2, skin, a)
  elseif pose == "inspect" then
    R(tx + 3, ty + 4, 8, 3, jk, a) R(tx + 3, ty + 6, 8, 1, jkD, a)
    R(tx + 11, ty + 4, 3, 3, skin, a)
  elseif pose == "freeze" then
    R(tx + 2, ty + 2, 3, 7, jk, a)
    R(tx + 3, ty - 4, 3, 4, skin, a)
  elseif pose == "fear" then
    R(tx + 2, ty + 1, 3, 8, jk, a)
    R(tx + 4, ty - 3, 3, 4, skin, a)
  else
    R(tx + sw, ty + 3, 3, 12, jk, a)
    R(tx + sw, ty + 3, 1, 12, jkD, a)
    R(tx + sw, ty + 15, 3, 2, skin, a)
  end

  -- голова
  local hy = -46 + dy
  local hx = lean
  if pose == "climb" then
    R(hx - 5, hy, 10, 11, hair, a)
    R(hx - 5, hy + 8, 10, 3, skinD, a)
    if o.lamp then R(hx - 5, hy + 3, 10, 1, P.dk1, a) end
    return
  end
  R(hx - 4, hy + 1, 9, 10, skin, a)
  R(hx - 4, hy + 1, 2, 10, skinD, a)
  R(hx - 3, hy + 10, 7, 1, skinD, a)
  R(hx - 5, hy, 10, 3, hair, a)
  R(hx - 5, hy, 4, 7, hair, a)
  R(hx + 2, hy + 3, 3, 1, hair, a)
  if o.stubble then R(hx + 1, hy + 8, 4, 2, skinD, a) end
  R(hx - 2, hy + 5, 2, 2, skinD, a)
  local eyeCol = o.eyesRed and P.red2 or P.black
  R(hx + 3, hy + 5, 1, 2, eyeCol, a)
  if o.eyesRed then R(hx + 1, hy + 5, 1, 1, P.red2, a) end
  R(hx + 5, hy + 6, 1, 2, skinD, a)
  R(hx + 2, hy + 9, 2, 1, pose == "fear" and P.black or skinD, a)
  if o.hat then R(hx - 6, hy - 1, 12, 4, o.hat, a) end
  if o.lamp then
    R(hx - 5, hy + 2, 10, 1, P.dk1, a)
    R(hx + 4, hy + 1, 3, 3, P.gray1, a)
    R(hx + 6, hy + 1, 1, 3, o.lampOn and P.yellow or P.gray3, a)
  end
end

function Gx.human(x, y, o)
  SX, SY, SF = floor(x), floor(y), (o.facing or 1) >= 0 and 1 or -1
  local fr = o.frame or 0
  local pose = o.pose or "idle"
  local t = love.timer.getTime()
  if not o.noOutline then
    Gx.override = P.black
    Gx.overrideA = 0.85
    local bx, by = SX, SY
    for _, d in ipairs({ { -1, 0 }, { 1, 0 }, { 0, -1 }, { 0, 1 } }) do
      SX, SY = bx + d[1], by + d[2]
      bodyPass(o, fr, pose, t)
    end
    SX, SY = bx, by
    Gx.override = nil
    Gx.overrideA = nil
  end
  bodyPass(o, fr, pose, t)
end

-- Спрайты из референса (src/sprites.lua); без них — отрисовка кодом
local DIMA_POSE = { idle = "idle", walk = "walk", inspect = "inspect", freeze = "freeze", sit = "sit",
  kneel = "kneel", climb = "climb", fear = "idle" }
local LEHA_POSE = { idle = "idle", walk = "walk", inspect = "inspect", freeze = "freeze", sit = "sit",
  kneel = "cry", fear = "freeze" }

local function spriteFrame(o, an)
  if an == "idle" then return math.floor(love.timer.getTime() * 0.9 + (o.seed or 0)) end
  return o.frame or 0
end

function Gx.dima(x, y, o)
  local an = DIMA_POSE[o.pose or "idle"]
  if Sprites.ok and an and not o.procedural then
    Sprites.draw("dima", an, spriteFrame(o, an), x, y, o.facing, o.alpha)
    return
  end
  o.jacket, o.jacket2, o.jacketL = P.blue1, P.night, P.blue2
  o.pants, o.pantsD = P.dk2, P.dk1
  o.hair = P.brown1
  o.backpack = P.green1
  o.lamp = true
  o.notebook = true
  o.seed = 0
  Gx.human(x, y, o)
end

function Gx.leha(x, y, o)
  local an = LEHA_POSE[o.pose or "idle"]
  if o.eyesRed and (an == "walk" or an == "idle") then an = "possessed" end
  if Fx and Fx.flash > 0 and (o.pose == "inspect" or o.pose == "idle") then an = "photo" end
  if Sprites.ok and an and not o.procedural then
    o.seed = 2
    Sprites.draw("leha", an, spriteFrame(o, an), x, y, o.facing, o.alpha)
    return
  end
  o.jacket, o.jacket2, o.jacketL = P.orange1, P.rust, P.orange2
  o.pants, o.pantsD = P.gray1, P.dk2
  o.hair = P.dk2
  o.backpack = P.dk2
  o.camera = true
  o.recorder = true
  o.stubble = true
  o.seed = 2
  Gx.human(x, y, o)
end

-- Лаптев в полный рост (финальный ритуал и концовка «Покой»)
function Gx.laptevFigure(x, y, t, a, facing)
  if Sprites.has("laptev") then
    Sprites.draw("laptev", "idle", t * 2, x, y, facing or -1, a * (0.85 + 0.15 * math.sin(t * 8)))
    return
  end
  Gx.human(x, y, { facing = facing or -1, pose = "idle", alpha = a * 0.7, jacket = P.white, jacket2 = P.gray4, pants = P.gray4, hair = P.gray4, hat = P.gray4 })
end

-------------------------------------------------------------- духи
-- «Призрачные» строки: через одну строку прозрачнее, с дрожью
local function ghostRow(col, x, y, w, a, t, k)
  local j = (math.sin(t * 7 + y * 0.9) > 0.92) and 1 or 0
  Gx.r(col, x + j, y, w, 1, a * ((y % 2 == 0) and 1 or 0.7) * (k or 1))
end

function Gx.evdokia(x, y, t, a)
  a = a or 1
  if Sprites.has("evd") then
    local fl = 0.88 + 0.12 * math.sin(t * 9)
    Sprites.draw("evd", "idle", t * 2.5, x, y + math.sin(t * 1.4) * 1.5, 1, a * fl)
    return
  end
  x, y = floor(x), floor(y + math.sin(t * 1.4) * 1.5)
  -- подол растворяется книзу
  for i = 0, 36 do
    local w = 8 + floor(i / 2.6)
    local fade = i > 28 and (1 - (i - 28) / 10) or 1
    ghostRow(P.black, x - w / 2, y - 36 + i, w, a * 0.95 * fade, t)
    if i % 6 == 2 then Gx.r(P.dk1, x - w / 2 + 2, y - 36 + i, 1, 4, a * 0.6 * fade) end
  end
  -- платок
  for i = 0, 14 do ghostRow(P.black, x - 6 + (i < 3 and 1 or 0), y - 50 + i, 12 - (i < 3 and 2 or 0), a, t) end
  -- лицо
  Gx.r(P.bone, x - 3, y - 46, 6, 8, a * 0.95)
  Gx.r(P.cream2, x - 3, y - 46, 1, 8, a * 0.6)
  Gx.r(P.dk1, x - 2, y - 43, 1, 2, a)
  Gx.r(P.dk1, x + 1, y - 43, 1, 2, a)
  Gx.r(P.cream2, x - 1, y - 40, 2, 1, a * 0.7)
  -- руки и свеча
  Gx.r(P.bone, x + 2, y - 29, 4, 3, a * 0.85)
  Gx.r(P.bone, x - 1, y - 28, 3, 2, a * 0.7)
  Gx.candle(x + 4, y - 29, t, true)
end

function Gx.alesha(x, y, t, a, horse, wave)
  a = a or 1
  if Sprites.has("alesha") then
    local an = (horse and not wave) and "idle" or "wave"
    Sprites.draw("alesha", an, t * 2, x, y, -1, a * (0.85 + 0.15 * math.sin(t * 7)))
    return
  end
  x, y = floor(x), floor(y)
  -- босые ноги, мокрые следы
  Gx.r(P.skin, x - 4, y - 4, 3, 4, a) Gx.r(P.skin, x + 1, y - 4, 3, 4, a)
  Gx.r(P.water, x - 6, y, 12, 1, a * 0.6)
  -- старое пальто с пуговицами
  for i = 0, 18 do ghostRow(P.brown1, x - 5 - floor(i / 9), y - 23 + i, 10 + floor(i / 9) * 2, a, t) end
  Gx.r(P.brown2, x - 5, y - 23, 2, 18, a)
  Gx.px(P.bone, x + 1, y - 18, a) Gx.px(P.bone, x + 1, y - 14, a) Gx.px(P.bone, x + 1, y - 10, a)
  Gx.r(P.brown1, x + 3, y - 20, 2, 10, a)
  Gx.r(P.skin, x + 3, y - 11, 2, 2, a)
  -- голова и ушанка
  Gx.r(P.skin, x - 3, y - 31, 7, 8, a)
  Gx.r(P.cream2, x - 3, y - 31, 1, 8, a * 0.6)
  Gx.r(P.gray1, x - 5, y - 34, 11, 4, a)
  Gx.r(P.gray2, x - 4, y - 34, 9, 1, a)
  Gx.r(P.gray1, x - 5, y - 30, 2, 5, a)
  Gx.r(P.gray1, x + 4, y - 30, 2, 5, a)
  Gx.px(P.black, x - 1, y - 28, a) Gx.px(P.black, x + 2, y - 28, a)
  Gx.px(P.cream2, x, y - 25, a)
  if horse then Gx.horse(x + 3, y - 10, a) end
end

-- Лаптев: светлое пятно в форме каски на стене
function Gx.helmetGlow(x, y, t, a)
  a = (a or 1) * (0.7 + 0.3 * math.sin(t * 2))
  for i = 0, 8 do
    local w = 22 - floor((8 - i) ^ 2 / 4)
    Gx.r(P.white, x - w / 2, y - 12 + i, w, 1, a * 0.55)
  end
  Gx.r(P.white, x - 14, y - 3, 28, 2, a * 0.45)
  Gx.r(P.white, x - 2, y - 11, 4, 3, a * 0.3)
end

-- Безымянные: серые, без лиц, вытянутые, двигаются рывками
function Gx.nameless(x, y, t, a, variant)
  a = a or 1
  variant = variant or 1
  if Sprites.has("nameless") then
    local jit = (math.sin(t * 9 + variant * 1.7) > 0.8) and ((Gx.hash(variant, math.floor(t * 20)) > 0.5) and 2 or -2) or 0
    Sprites.draw("nameless", "idle", variant - 1 + math.floor(t * 1.5) % 2, x + jit, y, 1, a * 0.9)
    return
  end
  x, y = floor(x), floor(y)
  local h = 46 + variant * 3
  local glitch = math.sin(t * 9 + variant * 1.7) > 0.75
  for i = 0, h do
    local yy = y - h + i
    local w, cx
    if i < 12 then w = 10 - math.abs(i - 6) / 2 cx = 0
    elseif i < h - 18 then w = 14 - (i - 12) / 10 cx = 0
    else w = 8 cx = 0 end
    local j = glitch and (Gx.hash(i, floor(t * 20)) > 0.7 and floor((Gx.hash(i, 3) - 0.5) * 6) or 0) or 0
    local col = i < 12 and P.gray3 or P.gray2
    if i >= h - 18 then
      Gx.r(col, x - 5 + j, yy, 3, 1, a * 0.8)
      Gx.r(col, x + 2 + j, yy, 3, 1, a * 0.8)
    else
      Gx.r(col, x - w / 2 + cx + j, yy, w, 1, a * ((i % 2 == 0) and 0.9 or 0.75))
    end
  end
  -- длинные руки до колен
  Gx.r(P.gray2, x - 10, y - h + 15, 3, 28 + variant, a * 0.7)
  Gx.r(P.gray2, x + 7, y - h + 15, 3, 26 + variant * 2, a * 0.7)
  -- впадины вместо лица
  Gx.r(P.dk2, x - 3, y - h + 4, 2, 3, a * 0.8)
  Gx.r(P.dk2, x + 1, y - h + 4, 2, 3, a * 0.8)
  Gx.r(P.dk2, x - 1, y - h + 9, 3, 1, a * 0.5)
end

-- Проповедник: ряса из мешковины, рваный подол, лица нет
function Gx.preacher(x, y, t, a, facing)
  a = a or 1
  if Sprites.has("preacher") then
    Sprites.draw("preacher", "idle", t * 2, x, y, facing or 1, a)
    return
  end
  x, y = floor(x), floor(y)
  local f = facing or 1
  for i = 0, 46 do
    local w = 10 + floor(i / 3)
    local wave = floor(math.sin(t * 2 + i * 0.2) * (i / 46) * 2)
    local yy = y - 48 + i
    Gx.r(P.brown1, x - w / 2 + wave, yy, w, 1, a)
    if Gx.hash(i, 77) > 0.5 then Gx.px(P.brown2, x - w / 2 + wave + floor(Gx.hash(i, 78) * w), yy, a) end
  end
  -- рваный подол
  for k = -9, 9, 3 do Gx.r(P.brown1, x + k + floor(math.sin(t * 3 + k)), y - 2, 2, 2 + floor(Gx.hash(k, 5) * 3), a) end
  Gx.r(P.brown2, x - 4 * f, y - 42, 2, 34, a * 0.5)
  Gx.r(P.black, x - 1, y - 40, 1, 36, a * 0.25)
  -- верёвочный пояс
  Gx.r(P.cream2, x - 7, y - 30, 14, 1, a * 0.8)
  Gx.r(P.cream2, x + 2 * f, y - 30, 1, 8, a * 0.8)
  -- капюшон и тьма внутри
  Gx.r(P.brown1, x - 8, y - 64, 16, 18, a)
  Gx.r(P.brown2, x - 8, y - 64, 16, 2, a)
  Gx.r(P.black, x - 4 + f, y - 60, 8, 12, a)
  Gx.px(P.red1, x - 2 + f, y - 55, a * 0.9)
  Gx.px(P.red1, x + 1 + f, y - 55, a * 0.9)
  -- рукава и костлявые кисти
  Gx.r(P.brown1, x - 13, y - 44, 5, 20, a)
  Gx.r(P.brown1, x + 8, y - 44, 5, 20, a)
  for k = 0, 3 do
    Gx.r(P.bone, x - 13 + k, y - 24, 1, 4 + (k % 2), a)
    Gx.r(P.bone, x + 9 + k, y - 24, 1, 4 + ((k + 1) % 2), a)
  end
end

-- Пиксельная «пыль» (растворение духа)
function Gx.dust(x, y, t, a, col)
  for i = 1, 40 do
    local hx = Gx.hash(i, 1) * 30 - 15
    local hy = Gx.hash(i, 2) * 60
    Gx.px(col or P.gray3, x + hx + math.sin(t * 2 + i) * t * 4, y - hy - t * 10 * Gx.hash(i, 3), a * (1 - Gx.hash(i, 4) * 0.5))
  end
end

return Gx
