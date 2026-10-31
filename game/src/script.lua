-- Сценарные корутины: say / talk / wait / choose и т.п.
local S = { active = {} }

function S.run(fn, block, tag)
  local co = coroutine.create(fn)
  local s = { co = co, block = (block ~= false), tag = tag }
  table.insert(S.active, s)
  S.step(s, 0)
  return s
end

function S.step(s, dt)
  if s.waitfn then
    if not s.waitfn(dt) then return end
    s.waitfn = nil
  end
  local ok, res = coroutine.resume(s.co)
  if not ok then
    error("Ошибка сценария: " .. tostring(res) .. "\n" .. debug.traceback(s.co))
  end
  if coroutine.status(s.co) == "dead" then
    s.dead = true
  else
    s.waitfn = res
  end
end

function S.update(dt)
  local list = S.active
  for i = 1, #list do
    local s = list[i]
    if s and not s.dead then S.step(s, dt) end
  end
  for i = #S.active, 1, -1 do
    if S.active[i].dead then table.remove(S.active, i) end
  end
end

function S.blocking()
  for _, s in ipairs(S.active) do
    if s.block and not s.dead then return true end
  end
  return false
end

function S.running(tag)
  for _, s in ipairs(S.active) do
    if s.tag == tag and not s.dead then return true end
  end
  return false
end

function S.clear()
  S.active = {}
end

-------------------------------------------------------------- функции для сценариев (глобальные)
function wait(sec)
  local e = 0
  coroutine.yield(function(dt) e = e + dt return e >= sec end)
end

function waitUntil(f)
  if f() then return end
  coroutine.yield(function() return f() end)
end

function say(sp, text, opts)
  local id = Dialog.push(sp, text, opts)
  waitUntil(function() return Dialog.isDone(id) end)
end

-- talk{ {"LEHA","..."}, {"DIMA","..."} }
function talk(list)
  for _, l in ipairs(list) do say(l[1], l[2], l[3]) end
end

function choose(options, prompt)
  UI.openChoice(options, prompt)
  waitUntil(function() return UI.choiceResult ~= nil end)
  local r = UI.choiceResult
  UI.choiceResult = nil
  return r
end

function hint(text, dur)
  UI.hint(text, dur)
end

function fadeOut(t)
  World.fadeTo(1, t or 0.6)
  wait(t or 0.6)
end

function fadeIn(t)
  World.fadeTo(0, t or 0.6)
  wait(t or 0.6)
end

function walkTo(who, x)
  local e = who == "LEHA" and World.leha or World.player
  e.tx = x
  if who == "LEHA" then e.manual = true end
  waitUntil(function() return e.tx == nil end)
end

function face(who, dir)
  local e = who == "LEHA" and World.leha or World.player
  e.facing = dir
end

function pose(who, p)
  local e = who == "LEHA" and World.leha or World.player
  e.pose = p
end

function sfx(name, vol, pitch, wx)
  Audio.play(name, vol, pitch, wx)
  if name == "sting" or name == "inhale" then World.scareFX(3)
  elseif name == "crash" or name == "flask" or name == "collapse" then World.scareFX(1.5) end
end

function shake(amount, dur)
  World.shake(amount, dur)
end

function readDoc(id)
  State.doc(id)
  UI.openDoc(id)
  waitUntil(function() return UI.modal == nil end)
end

return S
