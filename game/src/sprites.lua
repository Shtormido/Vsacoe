-- Спрайты персонажей и духов из референс-листа (assets/sprites, нарезка build/sprites/cut_sprites.py).
-- Если файлов нет, gfx.lua рисует персонажей кодом, как раньше.
local Sp = { img = {}, ok = false }
local lg = love.graphics
local floor = math.floor

-- Набор высокого разрешения (assets/sprites_hd, ×2.4) для приближенных сцен с артом
Sp.hd = {}
Sp.HD_MUL = 1.8

local function loadSet(dir, target, meta)
  for ch, anims in pairs(meta) do
    target[ch] = {}
    for an, n in pairs(anims) do
      local list = {}
      for i = 1, n do
        local path = dir .. "/" .. ch .. "/" .. an .. "_" .. i .. ".png"
        if love.filesystem.getInfo(path) then
          local im = lg.newImage(path)
          im:setFilter("nearest", "nearest")
          list[#list + 1] = im
        end
      end
      if #list > 0 then target[ch][an] = list end
    end
  end
end

function Sp.load()
  local ok, meta = pcall(require, "assets.sprites.sprites")
  if not ok or type(meta) ~= "table" then return end
  local okHd, metaHd = pcall(require, "assets.sprites_hd.sprites")
  if okHd and type(metaHd) == "table" then loadSet("assets/sprites_hd", Sp.hd, metaHd) end
  for ch, anims in pairs(meta) do
    Sp.img[ch] = {}
    for an, n in pairs(anims) do
      local list = {}
      for i = 1, n do
        local path = "assets/sprites/" .. ch .. "/" .. an .. "_" .. i .. ".png"
        if love.filesystem.getInfo(path) then
          local im = lg.newImage(path)
          im:setFilter("nearest", "nearest")
          list[#list + 1] = im
        end
      end
      if #list > 0 then Sp.img[ch][an] = list end
    end
  end
  Sp.ok = Sp.img.dima ~= nil and Sp.img.leha ~= nil
end

function Sp.has(ch, an)
  return Sp.img[ch] ~= nil and (an == nil or Sp.img[ch][an] ~= nil)
end

-- Рисует кадр: (x, y) — середина ступней; facing: 1 вправо, -1 влево
function Sp.draw(ch, an, frame, x, y, facing, alpha)
  local set = Sp.img[ch]
  if not set then return false end
  local k = 1
  if World and World.zoom > 1.5 and Sp.hd[ch] and (Sp.hd[ch][an] or Sp.hd[ch].idle) then
    set = Sp.hd[ch]
    k = (World.charScale or 1) / Sp.HD_MUL
  elseif World then
    k = World.charScale or 1
  end
  local list = set[an] or set.idle
  if not list then return false end
  local img = list[(floor(frame or 0) % #list) + 1]
  local a = alpha or 1
  local o = Gx.override
  if o then
    lg.setColor(o[1], o[2], o[3], a * (Gx.overrideA or 1))
  else
    lg.setColor(1, 1, 1, a)
  end
  local f = (facing or 1) >= 0 and 1 or -1
  if k ~= 1 then
    lg.draw(img, x, y, 0, f * k, k, floor(img:getWidth() / 2), img:getHeight())
  else
    lg.draw(img, floor(x), floor(y), 0, f, 1, floor(img:getWidth() / 2), img:getHeight())
  end
  return true
end

return Sp
