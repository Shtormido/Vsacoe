-- Общие заготовки для сцен: константы говорящих, наборы отрисовки, отдых
D, L = "DIMA", "LEHA"
EV, LA, AL, PR, CH, VO, PH = "EVD", "LAPTEV", "ALESHA", "PREACHER", "CHOIR", "VOICE", "PHONE"

local K = {}
local lg = love.graphics

function K.vgrad(x, y, w, h, c1, c2)
  for i = 0, h - 1 do
    local t = i / math.max(1, h - 1)
    lg.setColor(c1[1] + (c2[1] - c1[1]) * t, c1[2] + (c2[2] - c1[2]) * t, c1[3] + (c2[3] - c1[3]) * t, 1)
    lg.rectangle("fill", x, y + i, w, 1)
  end
end

-- Пол с «перспективой»: полосы и шум
function K.floor(x, y, w, col1, col2, h)
  h = h or (H - y)
  Gx.r(col1, x, y, w, h)
  for i = 0, h, 7 do Gx.r(col2, x, y + i + math.floor(i / 10), w, 1, 0.5) end
  for i = 0, w * h / 60 do
    Gx.px(col2, x + Gx.hash(i, 1.7) * w, y + Gx.hash(i, 4.2) * h, 0.6)
  end
end

function K.column(x, y0, y1, col, col2, skirt)
  -- цилиндрическая светотень: тёмный край, основной тон, блик, тёмный край
  Gx.r(col, x, y0, 18, y1 - y0)
  Gx.r(col2, x, y0, 3, y1 - y0)
  Gx.r(col2, x + 3, y0, 1, y1 - y0, 0.5)
  Gx.r(P.white, x + 11, y0, 2, y1 - y0, 0.18)
  Gx.r(P.white, x + 12, y0, 1, y1 - y0, 0.12)
  Gx.r(col2, x + 15, y0, 3, y1 - y0, 0.7)
  Gx.r(P.black, x + 17, y0, 1, y1 - y0, 0.35)
  for yy = y0, y1, 9 do Gx.r(col2, x, yy, 18, 1, 0.4) end
  if skirt then
    Gx.r(skirt, x - 1, y1 - 12, 20, 12)
    Gx.r(P.white, x - 1, y1 - 12, 20, 1, 0.15)
  end
  Gx.r(col2, x - 2, y0, 22, 4)
  Gx.r(P.white, x - 2, y0, 22, 1, 0.15)
  Gx.r(P.black, x - 2, y0 + 4, 22, 2, 0.3)
end

function K.bellLamp(x, y, broken)
  Gx.r(P.dk2, x, 0, 1, y)
  Gx.r(P.gray2, x - 4, y, 9, 2)
  Gx.r(P.gray3, x - 5, y + 2, 11, 5)
  if broken then
    Gx.r(P.black, x - 2, y + 4, 5, 3)
  else
    Gx.r(P.cream, x - 4, y + 6, 9, 2)
  end
end

function K.sign(x, y, text, bg, fg, font)
  font = Gx.F(font)
  local w = font:getWidth(text) + 10
  Gx.r(P.dk1, x - 1, y - 1, w + 2, font:getHeight() + 6)
  Gx.r(bg, x, y, w, font:getHeight() + 4)
  Gx.text(text, x + 5, y + 2, fg, 1, font)
  return w
end

-- Станция: стена за путями, путевая яма, платформа
function K.station(sc, o)
  local w = sc.w
  o = o or {}
  local wallC, groutC = o.wall or P.cream, o.grout or P.cream2
  Gx.r(o.ceil or P.dk1, 0, 0, w, 30)
  Gx.tiles(0, 30, w, 118, o.tw or 10, o.th or 6, wallC, groutC, o.wear)
  Gx.r(o.band or P.green1, 0, 120, w, 28)
  Gx.r(P.black, 0, 148, w, 46)
  Gx.r(P.dk1, 0, 186, w, 8)
  for x = 0, w, 12 do Gx.r(P.brown1, x, 182, 8, 4) end
  Gx.r(P.rust, 0, 180, w, 2)
  Gx.r(P.gray2, 0, 180, w, 1, 0.5)
  Gx.r(P.gray1, 0, 194, w, 4)
  Gx.r(o.edge or P.cream2, 0, 198, w, 3)
  K.floor(0, 201, w, o.floor or P.gray1, o.floor2 or P.dk2)
end

-- Тоннель: тюбинги, лотки, рельсы
function K.tunnel(sc, o)
  local w = sc.w
  o = o or {}
  local wall, wall2 = o.wall or P.gray1, o.wall2 or P.dk2
  Gx.r(P.black, 0, 0, w, H)
  for x = 0, w, 2 do
    local top = 24 + math.floor((math.sin(x * 0.0) + 1) * 0)
    Gx.r(wall, x, top, 2, 190 - top)
  end
  -- арочный свод
  for i = 0, 22 do Gx.r(wall2, 0, i, w, 1, 1 - i / 23) end
  for x = 0, w, 40 do
    Gx.r(wall2, x, 20, 3, 190)
    for y = 30, 190, 22 do Gx.r(wall2, x + 3, y, 37, 1, 0.6) end
  end
  if o.bricks then Gx.bricks(0, 26, w, 160, o.brick or P.brown2, P.dk2, P.rust) end
  Gx.cableTray(0, 70, w)
  Gx.cableTray(0, 90, w)
  for x = 20, w, 90 do Gx.cagedLamp(x, 40, false) end
  K.floor(0, 196, w, o.floor or P.dk2, P.dk1)
  Gx.rails(0, 238, w)
end

-- Служебный коридор
function K.corridor(sc, o)
  local w = sc.w
  o = o or {}
  Gx.r(P.dk1, 0, 0, w, 36)
  Gx.concrete(0, 36, w, 170, o.wall or P.gray1, P.dk2, 3)
  Gx.r(o.paint or P.green1, 0, 140, w, 66)
  Gx.r(P.dk2, 0, 139, w, 1)
  for i = 1, math.floor(w / 60) do
    local x = Gx.hash(i, 5) * w
    Gx.stain(x, 60 + Gx.hash(i, 6) * 60, 12 + Gx.hash(i, 7) * 10, 8, P.dk2, 0.6, i)
  end
  K.floor(0, 206, w, P.dk2, P.dk1)
end

-------------------------------------------------------------- поведение
function lehaFollow()
  World.leha.manual = false
  World.leha.tx = nil
end

function giveFragment(n)
  if G.mapFrag[n] then return end
  G.mapFrag[n] = true
  UI.toast("Карта: фрагмент №" .. n .. " (M)", 4)
end

-- Точка отдыха: сесть, сохраниться, снизить панику
function restAt(sc, x, label)
  local p, l = World.player, World.leha
  p.pose = "sit"
  l.manual = true
  l.tx = nil
  l.x = x + 20
  l.facing = -1
  l.pose = "sit"
  State.panic(-15)
  G.rest = { scene = World.sceneId, x = x }
  State.save()
end

function standUp()
  World.player.pose = "idle"
  World.leha.pose = "idle"
  lehaFollow()
end

function strange(n, abs)
  State.strange(n, abs)
end

return K
