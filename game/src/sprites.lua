-- Спрайты персонажей и духов из референс-листа (assets/sprites, нарезка build/sprites/cut_sprites.py).
-- Если файлов нет, gfx.lua рисует персонажей кодом, как раньше.
local Sp = { img = {}, ok = false }
local lg = love.graphics
local floor = math.floor

function Sp.load()
  local ok, meta = pcall(require, "assets.sprites.sprites")
  if not ok or type(meta) ~= "table" then return end
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
  lg.draw(img, floor(x), floor(y), 0, f, 1, floor(img:getWidth() / 2), img:getHeight())
  return true
end

return Sp
