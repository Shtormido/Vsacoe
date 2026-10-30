-- Пиксельная отрисовка: примитивы, персонажи, духи и типовой реквизит
local Gx = {}
local lg = love.graphics
local floor = math.floor

function Gx.c(col, a) lg.setColor(col[1], col[2], col[3], a or 1) end

function Gx.r(col, x, y, w, h, a)
  lg.setColor(col[1], col[2], col[3], a or 1)
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
        if hx > 0.85 then Gx.px(grout, x + tx + 2, y + ty + 1, 0.6) end
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
      if x1 > x0 then Gx.r(cc, x + x0, y + by, x1 - x0, math.min(bh - 1, h - by)) end
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

-------------------------------------------------------------- персонажи
-- x — центр, y — уровень ступней. o.facing: 1 вправо, -1 влево.
function Gx.human(x, y, o)
  local f = o.facing or 1
  local fr = o.frame or 0
  local pose = o.pose or "idle"
  local a = o.alpha or 1
  local jk, jk2 = o.jacket, o.jacket2
  local pants, skin, hair = o.pants or P.dk2, P.skin, o.hair or P.brown1
  x, y = floor(x), floor(y)

  if pose == "sit" then
    -- сидит на скамейке
    Gx.r(pants, x - 4, y - 14, 12 * 1, 4, a)
    Gx.r(P.black, x - 4 + f * 9, y - 14, 3, 13, a)
    Gx.r(pants, x - 5, y - 14, 5, 4, a)
    Gx.r(pants, x - 2 + f * 6, y - 13, 3, 12, a)
    Gx.r(P.black, x - 2 + f * 6, y - 2, 4, 2, a)
    Gx.r(jk, x - 6, y - 31, 12, 18, a)
    Gx.r(jk2, x - 6, y - 31, 3, 18, a)
    Gx.r(skin, x - 4, y - 42, 9, 10, a)
    Gx.r(hair, x - 5, y - 43, 10, 3, a)
    Gx.px(P.black, x + f * 2, y - 38, a)
    if o.lamp then Gx.px(P.yellow, x + f * 4, y - 41, a) end
    return
  end

  local lift = 0
  local legL, legR = 0, 0
  if pose == "walk" then
    local cyc = { { -2, 2 }, { 0, 0 }, { 2, -2 }, { 0, 0 } }
    local c = cyc[(fr % 4) + 1]
    legL, legR = c[1], c[2]
    lift = (fr % 2 == 1) and -1 or 0
  end
  local bodyDy = lift
  local lean = 0
  if pose == "inspect" then lean = 2 bodyDy = 2 end
  if pose == "freeze" then bodyDy = 4 end
  if pose == "kneel" then bodyDy = 10 end

  -- ноги
  if pose == "kneel" then
    Gx.r(pants, x - 5, y - 8, 12, 4, a)
    Gx.r(P.black, x - 6, y - 4, 4, 4, a)
  elseif pose == "climb" then
    Gx.r(pants, x - 5, y - 16, 4, 14 + (fr % 2) * 2, a)
    Gx.r(pants, x + 1, y - 16, 4, 16 - (fr % 2) * 2, a)
  else
    local lh = pose == "freeze" and 12 or 16
    Gx.r(pants, x - 5 + legL, y - lh, 4, lh - 2, a)
    Gx.r(P.black, x - 5 + legL + (f > 0 and 0 or -1), y - 3, 5, 3, a)
    Gx.r(jk2 and pants or pants, x + 1 + legR, y - lh, 4, lh - 2, a)
    Gx.r(P.black, x + 1 + legR + (f > 0 and 0 or -1), y - 3, 5, 3, a)
  end

  local ty = y - 34 + bodyDy
  local tx = x - 7 + lean * f
  -- рюкзак
  if o.backpack then Gx.r(o.backpack, tx + (f > 0 and -4 or 12), ty + 2, 6, 13, a) end
  -- торс
  Gx.r(jk, tx, ty, 14, 19, a)
  Gx.r(jk2, tx + (f > 0 and 0 or 10), ty, 4, 19, a)
  Gx.r(jk2, tx, ty + 17, 14, 2, a)
  -- рука
  if pose == "climb" then
    Gx.r(jk, tx - 1, ty - 8, 3, 10, a)
    Gx.r(jk, tx + 12, ty - 6 - (fr % 2) * 2, 3, 10, a)
  elseif pose == "inspect" then
    Gx.r(jk, tx + (f > 0 and 11 or -6), ty + 6, 9, 3, a)
    Gx.r(skin, tx + (f > 0 and 19 or -8), ty + 6, 2, 3, a)
  elseif pose == "freeze" then
    Gx.r(jk, tx + (f > 0 and 9 or 2), ty + 3, 3, 8, a)
    Gx.r(skin, tx + (f > 0 and 10 or 2), ty - 3, 3, 3, a)
  else
    local sw = pose == "walk" and ((fr % 4 == 0) and 1 or ((fr % 4 == 2) and -1 or 0)) or 0
    Gx.r(jk2, tx + 5 + sw * f, ty + 2, 4, 13, a)
    Gx.r(skin, tx + 5 + sw * f, ty + 15, 4, 2, a)
  end
  if o.camera then
    Gx.r(P.black, tx + (f > 0 and 8 or 2), ty + 5, 5, 4, a)
    Gx.px(P.gray3, tx + (f > 0 and 11 or 3), ty + 6, a)
    Gx.line(P.black, tx + 3, ty, tx + (f > 0 and 9 or 4), ty + 5, a)
  end
  if o.recorder then Gx.r(P.gray2, tx + (f > 0 and 1 or 11), ty + 8, 2, 3, a) end

  -- голова
  local hy = y - 46 + bodyDy
  local hx = x - 5 + lean * f
  if pose == "climb" then
    Gx.r(hair, hx, hy, 10, 11, a)
    if o.lamp then Gx.r(P.dk1, hx, hy + 3, 10, 1, a) end
    return
  end
  Gx.r(skin, hx, hy, 10, 11, a)
  Gx.r(hair, hx, hy, 10, 3, a)
  Gx.r(hair, hx + (f > 0 and 0 or 7), hy, 3, 7, a)
  if o.hat then Gx.r(o.hat, hx - 1, hy - 1, 12, 4, a) end
  local ex = hx + (f > 0 and 6 or 2)
  local eyeCol = o.eyesRed and P.red2 or P.black
  Gx.px(eyeCol, ex, hy + 5, a)
  if o.eyesRed then Gx.px(P.red2, ex + (f > 0 and 2 or -2), hy + 5, a) end
  Gx.px(P.cream2, hx + (f > 0 and 9 or 0), hy + 7, a)
  if pose == "fear" then Gx.r(P.dk1, ex - f, hy + 8, 2, 2, a) end
  if o.lamp then
    Gx.r(P.dk1, hx, hy + 2, 10, 1, a)
    Gx.r(o.lampOn and P.yellow or P.gray2, hx + (f > 0 and 9 or -1), hy + 1, 2, 3, a)
  end
end

function Gx.dima(x, y, o)
  o.jacket = P.blue1
  o.jacket2 = P.night
  o.pants = P.dk2
  o.hair = P.brown1
  o.backpack = P.green1
  o.lamp = true
  Gx.human(x, y, o)
end

function Gx.leha(x, y, o)
  o.jacket = P.orange1
  o.jacket2 = P.rust
  o.pants = P.gray1
  o.hair = P.dk2
  o.backpack = P.dk2
  o.camera = true
  o.recorder = true
  Gx.human(x, y, o)
end

-------------------------------------------------------------- духи
function Gx.evdokia(x, y, t, a)
  a = a or 1
  x, y = floor(x), floor(y)
  local sway = floor(math.sin(t * 1.3) * 1)
  -- платье
  for i = 0, 34 do
    local w = 8 + floor(i / 3)
    Gx.r(P.black, x - w / 2 + sway * (1 - i / 34), y - 36 + i, w, 1, a * 0.95)
  end
  -- платок
  Gx.r(P.black, x - 6, y - 48, 12, 14, a)
  Gx.r(P.bone, x - 3, y - 45, 6, 7, a * 0.9)
  Gx.px(P.dk1, x - 2, y - 42, a)
  Gx.px(P.dk1, x + 1, y - 42, a)
  -- свеча в руках
  Gx.r(P.bone, x + 3, y - 30, 3, 3, a * 0.8)
  Gx.candle(x + 4, y - 30, t, true)
end

function Gx.alesha(x, y, t, a, horse)
  a = a or 1
  x, y = floor(x), floor(y)
  Gx.r(P.skin, x - 4, y - 3, 3, 3, a)
  Gx.r(P.skin, x + 1, y - 3, 3, 3, a)
  Gx.r(P.dk2, x - 4, y - 10, 8, 7, a)
  Gx.r(P.brown1, x - 5, y - 22, 10, 13, a)
  Gx.r(P.brown2, x - 5, y - 22, 2, 13, a)
  Gx.r(P.skin, x - 3, y - 30, 7, 8, a)
  Gx.r(P.gray1, x - 4, y - 32, 9, 4, a)
  Gx.r(P.gray1, x - 4, y - 28, 2, 4, a)
  Gx.r(P.gray1, x + 3, y - 28, 2, 4, a)
  Gx.px(P.black, x - 1, y - 27, a)
  Gx.px(P.black, x + 2, y - 27, a)
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
end

function Gx.nameless(x, y, t, a, variant)
  a = a or 1
  variant = variant or 1
  x, y = floor(x), floor(y)
  local h = 44 + variant * 2
  local jit = (math.sin(t * 9 + variant) > 0.7) and 1 or 0
  local col = P.gray2
  Gx.r(col, x - 4 + jit, y - 18, 3, 18, a * 0.8)
  Gx.r(col, x + 1 + jit, y - 18, 3, 18, a * 0.8)
  Gx.r(col, x - 7, y - h + 12, 14, 22, a * 0.85)
  Gx.r(col, x - 9, y - h + 14, 3, 18, a * 0.7)
  Gx.r(col, x + 6, y - h + 14, 3, 18 + variant, a * 0.7)
  Gx.r(P.gray3, x - 5, y - h, 10, 12, a * 0.9)
  -- лица нет: только тень вместо глаз
  Gx.r(P.gray2, x - 3, y - h + 4, 6, 2, a * 0.7)
end

function Gx.preacher(x, y, t, a, facing)
  a = a or 1
  x, y = floor(x), floor(y)
  local f = facing or 1
  for i = 0, 44 do
    local w = 10 + floor(i / 3)
    local wave = floor(math.sin(t * 2 + i * 0.2) * (i / 44) * 2)
    Gx.r(P.brown1, x - w / 2 + wave, y - 46 + i, w, 1, a)
  end
  Gx.r(P.brown2, x - 4, y - 40, 2, 30, a * 0.5)
  -- капюшон
  Gx.r(P.brown1, x - 7, y - 60, 14, 16, a)
  Gx.r(P.black, x - 4 + f, y - 56, 8, 10, a)
  -- рукава
  Gx.r(P.brown1, x - 12, y - 42, 5, 18, a)
  Gx.r(P.brown1, x + 7, y - 42, 5, 18, a)
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
