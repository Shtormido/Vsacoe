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

-- Озвучка: assets/voice/<md5(говорящий|текст)>.ogg
local VOICE_GAIN = { CHOIR = 0.6, PHONE = 0.6, PREACHER = 0.85, EVD = 0.9, DIMA = 1.15, LEHA = 1.05 }

local function voiceFor(c)
  if not (G and G.settings and G.settings.voice) or not Audio.ok then return nil end
  local ok, hex = pcall(function()
    return love.data.encode("string", "hex", love.data.hash("md5", c.sp .. "|" .. c.text))
  end)
  if not ok then return nil end
  local path = "assets/voice/" .. hex .. ".ogg"
  if not love.filesystem.getInfo(path) then return nil end
  local src = love.audio.newSource(path, "static")
  local g = (VOICE_GAIN[c.sp] or 1) * (c.opts.quiet and 0.55 or 1)
  src:setVolume(math.min(1, Audio.master * (G.settings.voiceVol or 0.9) * g))
  src:play()
  return src
end

local function stopVoice(c)
  if c and c.voice then c.voice:stop() c.voice = nil end
end

-- Пауза игры (дневник, карта, меню) приостанавливает и голос
function D.setPaused(p)
  local c = D.cur
  if not c or not c.voice then return end
  if p and c.voice:isPlaying() then c.voice:pause() c.voicePaused = true
  elseif not p and c.voicePaused then c.voice:play() c.voicePaused = false end
end

function D.clear()
  for _, q in ipairs(D.queue) do D.finished[q.id] = true end
  stopVoice(D.cur)
  if D.cur then D.finished[D.cur.id] = true end
  D.queue = {}
  D.cur = nil
end

local function finish()
  stopVoice(D.cur)
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
    c.voice = voiceFor(c)
    D.stat = D.stat or { voiced = 0, silent = 0, missing = {} }
    if c.voice then D.stat.voiced = D.stat.voiced + 1
    elseif c.sp ~= "NARR" then D.stat.silent = D.stat.silent + 1 D.stat.missing[#D.stat.missing + 1] = c.sp .. ": " .. c.text end
    if c.voice then
      -- текст печатается в темпе речи
      c.vdur = c.voice:getDuration()
      c.cps = math.max(CPS * 0.5, c.len / math.max(0.3, c.vdur * 0.85))
    end
  end
  local c = D.cur
  if not c then return end
  if c.shown < c.len then
    c.shown = math.min(c.len, c.shown + dt * (c.cps or CPS * (c.opts.slow and 0.6 or 1)))
    local n = math.floor(c.shown)
    if not c.voice and n - c.lastBlip >= 2 then
      c.lastBlip = n
      local spd = SPEAKERS[c.sp]
      if spd and spd.blip then
        local ch = U.usub(c.text, n, n)
        if ch ~= " " then
          Audio.play("blip_" .. spd.blip, c.opts.quiet and 0.25 or 0.55, 0.92 + love.math.random() * 0.16)
        end
      end
    end
  elseif c.voice then
    -- ждём конца фразы и короткую паузу
    if not c.voice:isPlaying() and not c.voicePaused then
      c.wait = c.wait + dt
      if c.wait >= 0.45 then finish() end
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
