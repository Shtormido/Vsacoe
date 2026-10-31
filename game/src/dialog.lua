-- Реплики в пиксельных пузырях над головой говорящего. Очередь: пока говорит один, второй ждёт.
local D = { queue = {}, cur = nil, idc = 0, finished = {} }

SPEAKERS = {
  DIMA     = { col = "blue3", blip = "DIMA" },
  LEHA     = { col = "orange2", blip = "LEHA" },
  EVD      = { col = "violet2", blip = "SPIRIT" },
  LAPTEV   = { col = "violet2", blip = "SPIRIT" },
  ALESHA   = { col = "violet2", blip = "SPIRIT" },
  PHONE    = { col = "violet2", blip = "SPIRIT" },
  PREACHER = { col = "red2", blip = "ENEMY" },
  CHOIR    = { col = "red2", blip = "ENEMY" },
  VOICE    = { col = "red2", blip = "ENEMY" },
  ARCH     = { col = "gray4", blip = "OTHER" },
  WOMAN    = { col = "gray4", blip = "OTHER" },
  NARR     = { col = "white", blip = nil },
}

local CPS = 38

function D.push(sp, text, opts)
  D.idc = D.idc + 1
  table.insert(D.queue, { id = D.idc, sp = sp, text = text, opts = opts or {} })
  return D.idc
end

function D.isDone(id) return D.finished[id] == true end

function D.active() return D.cur ~= nil or #D.queue > 0 end

function D.clear()
  for _, q in ipairs(D.queue) do D.finished[q.id] = true end
  if D.cur then D.finished[D.cur.id] = true end
  D.queue = {}
  D.cur = nil
end

local function finish()
  if D.cur then D.finished[D.cur.id] = true end
  D.cur = nil
end

function D.update(dt)
  if not D.cur and #D.queue > 0 then
    local c = table.remove(D.queue, 1)
    c.len = U.ulen(c.text)
    c.shown = 0
    c.wait = 0
    c.hold = math.min(6.5, 1.1 + c.len * 0.045)
    if c.opts.hold then c.hold = c.opts.hold end
    c.lastBlip = 0
    D.cur = c
  end
  local c = D.cur
  if not c then return end
  if c.shown < c.len then
    c.shown = math.min(c.len, c.shown + dt * CPS * (c.opts.slow and 0.6 or 1))
    local n = math.floor(c.shown)
    if n - c.lastBlip >= 2 then
      c.lastBlip = n
      local spd = SPEAKERS[c.sp]
      if spd and spd.blip then
        local ch = U.usub(c.text, n, n)
        if ch ~= " " then
          Audio.play("blip_" .. spd.blip, c.opts.quiet and 0.25 or 0.55, 0.92 + love.math.random() * 0.16)
        end
      end
    end
  else
    c.wait = c.wait + dt
    if c.wait >= c.hold then finish() end
  end
end

function D.skip()
  local c = D.cur
  if not c then return false end
  if c.shown < c.len then c.shown = c.len else finish() end
  return true
end

local lg = love.graphics

function D.draw(camx, shakeX, shakeY)
  local c = D.cur
  if not c then return end
  local spd = SPEAKERS[c.sp] or SPEAKERS.NARR
  local col = P[spd.col]
  local font = Fonts.small
  local text = U.usub(c.text, 1, math.floor(c.shown))
  local maxw = c.opts.width or 200
  local _, full = font:getWrap(c.text, maxw)
  local _, lines = font:getWrap(text, maxw)
  local w = 0
  for _, l in ipairs(full) do w = math.max(w, font:getWidth(l)) end
  local lh = 12
  local h = #full * lh + 6
  w = w + 10
  local x, y, tailx
  if c.opts.screen or not World.speakerPos(c.sp, c.opts) then
    x = math.floor(W / 2 - w / 2)
    y = c.opts.screenY or 222
    tailx = nil
  else
    local wx, wy = World.speakerPos(c.sp, c.opts)
    local sx = wx - camx
    x = math.floor(sx - w / 2)
    y = math.floor(wy - h - 8)
    tailx = math.floor(U.clamp(sx, 6, W - 6))
    if y < 22 then y = 22 end
  end
  x = U.clamp(x, 3, W - w - 3)
  local a = c.opts.quiet and 0.6 or 1
  local jx = 0
  if c.opts.shaky then jx = love.math.random(-1, 1) end
  -- пузырь
  lg.setColor(P.black[1], P.black[2], P.black[3], 0.86 * a)
  lg.rectangle("fill", x + 1, y, w - 2, h)
  lg.rectangle("fill", x, y + 1, w, h - 2)
  lg.setColor(col[1], col[2], col[3], 0.9 * a)
  lg.rectangle("fill", x + 1, y, w - 2, 1)
  lg.rectangle("fill", x + 1, y + h - 1, w - 2, 1)
  lg.rectangle("fill", x, y + 1, 1, h - 2)
  lg.rectangle("fill", x + w - 1, y + 1, 1, h - 2)
  if tailx then
    local tx = U.clamp(tailx, x + 4, x + w - 5)
    lg.setColor(P.black[1], P.black[2], P.black[3], 0.86 * a)
    lg.rectangle("fill", tx - 1, y + h - 1, 3, 2)
    lg.rectangle("fill", tx, y + h + 1, 1, 2)
    lg.setColor(col[1], col[2], col[3], 0.9 * a)
    lg.rectangle("fill", tx - 2, y + h - 1, 1, 2)
    lg.rectangle("fill", tx + 2, y + h - 1, 1, 2)
    lg.rectangle("fill", tx - 1, y + h + 1, 1, 2)
    lg.rectangle("fill", tx + 1, y + h + 1, 1, 2)
    lg.rectangle("fill", tx, y + h + 3, 1, 1)
  end
  lg.setColor(col[1], col[2], col[3], a)
  for i, l in ipairs(lines) do
    Gx.print(font, l, x + 5 + jx, y + 3 + (i - 1) * lh)
  end
end

return D
