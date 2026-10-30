-- Автопрохождение для проверки (запуск: love . --test [A|B])
local T = { shots = 0, done = false, t = 0 }
local co
local ending = "B"
local ANSWERS = { ["Евдокия"] = true, ["Пётр Степанович"] = true, ["Алёша"] = true }

local function log(...) print("[test]", ...) io.stdout:flush() end

local function frame() coroutine.yield() end
local function sleep(sec)
  local e = 0
  while e < sec do e = e + T.dt frame() end
end
local function untilTrue(f, limit)
  local e = 0
  while not f() do
    e = e + T.dt
    if e > (limit or 300) then
      local tags = {}
      for _, sc in ipairs(Script.active) do tags[#tags + 1] = tostring(sc.tag) end
      error("таймаут ожидания в сцене " .. tostring(World.sceneId) .. " fade=" .. World.fade .. " скрипты=" .. table.concat(tags, ",") .. " modal=" .. tostring(UI.modal))
    end
    frame()
  end
end
local function idle() untilTrue(function() return not Script.blocking() and not UI.modal and not Dialog.active() end) end

local function shot(name)
  T.shots = T.shots + 1
  local fn = string.format("shot_%02d_%s.png", T.shots, name)
  love.graphics.captureScreenshot(fn)
  log("скриншот", fn)
end

local function obj(id)
  for _, o in ipairs(World.objects()) do if o.id == id then return o end end
  return nil
end

local function use(id)
  log("use", id, World.sceneId)
  idle()
  local o = obj(id)
  if not o then error("нет объекта " .. id .. " в сцене " .. World.sceneId) end
  World.player.x = o.ax or (o.x + (o.w or 20) / 2)
  World.useObject(o)
  frame()
  idle()
end

local function exitBy(id, expect)
  log("exit", id, "->", expect)
  idle()
  local o = obj(id)
  if not o then error("нет выхода " .. id .. " в сцене " .. World.sceneId) end
  World.player.x = o.ax or (o.x + (o.w or 20) / 2)
  World.useObject(o)
  untilTrue(function() return World.sceneId == expect and World.fade < 0.05 end, 30)
  log("сцена", expect)
end

local function walk(x)
  idle()
  World.player.tx = x
  untilTrue(function() return World.player.tx == nil end, 120)
  frame()
  idle()
end

-- удерживать «Замри» и дышать в зелёном окне
local function freezeWhile(f, limit)
  T.hold = { space = true }
  local e = 0
  while f() do
    local b = World.breath
    if b.active and not b.ok then
      local ph = b.t % 3.0
      if ph > 2.3 and ph < 2.8 then
        World.spaceReleased()
        frame()
        World.spacePressed()
      end
    end
    e = e + T.dt
    if e > (limit or 120) then error("таймаут «Замри»") end
    frame()
  end
  T.hold = nil
  frame()
end

local function scene(id) untilTrue(function() return World.sceneId == id end, 200) log("сцена", id) end

local function runScene(id)
  App.newGame()
  G.flags.rest_evd, G.flags.rest_laptev, G.flags.rest_alesha = true, true, true
  sleep(1)
  World.enter(id)
  World.fade = 0
  sleep(3)
  shot("scene_" .. id)
  sleep(0.5)
  T.done = true
end

local function run()
  if T.only then return runScene(T.only) end
  App.newGame()
  scene("surface")
  sleep(7) idle()
  shot("surface")
  use("plate") use("grate")
  use("ladder")
  scene("descent") sleep(4) shot("descent")
  scene("corridor") idle()
  G.light = true
  walk(400) walk(700) sleep(2) idle()
  shot("corridor")
  use("vent") use("tray") use("sign")
  exitBy("exit", "severnaya")
  walk(300) shot("severnaya")
  use("mosaic") use("clock") use("poster") use("tile") use("closet") use("bench")
  exitBy("exit", "tunnel_sl")
  walk(700) walk(1300) sleep(16) idle() shot("tunnel_sl")
  use("sign") use("salt")
  exitBy("exit", "lipovaya")
  walk(200) shot("lipovaya")
  use("graffiti") use("hut") use("tabel") use("board") use("niche")
  walk(860) untilTrue(function() return G.flags.act1done end, 60) idle()
  shot("lipovaya_tile")
  exitBy("exit", "tunnel_drip")
  walk(400) use("drip") walk(800)
  scene("lipovaya") idle()
  shot("thermos")
  use("door2") use("thermos") use("niche2")
  exitBy("exit", "tunnel_drip")
  walk(1250)
  exitBy("exit", "side_passage")
  use("steps") use("wall") shot("side_passage")
  exitBy("exit", "booth")
  use("scheme") use("names") use("battery") shot("booth")
  exitBy("exit", "niche_dict")
  sleep(3) idle()
  local src = World.sc.def.listen[1]
  Script.run(function() src.onRecord(World.sc) end, true)
  idle()
  use("bench") shot("niche_dict")
  exitBy("exit", "cable_tunnel")
  sleep(42) idle() shot("cable_tunnel")
  exitBy("exit", "clock_platform")
  sleep(5) idle()
  use("clock")
  UI.openMap() World.sc.def.onMap(World.sc) sleep(0.5) shot("map") UI.modal = nil
  idle()
  exitBy("exit", "hands_passage")
  walk(300) use("hand") walk(700) idle() shot("hands")
  exitBy("exit", "monastyrskaya")
  walk(200) idle()
  untilTrue(function() return G.flags.monScare end, 90)
  idle() shot("monastyrskaya")
  exitBy("exit", "tunnel3")
  idle() use("plan") walk(600) walk(900) walk(1300) idle() shot("tunnel3")
  exitBy("exit", "mirror")
  walk(450) walk(760) idle() shot("mirror")
  walk(40) untilTrue(function() return G.flags.walled end, 20) idle()
  walk(1270)
  exitBy("exit", "admin_corridor")
  exitBy("office", "office")
  use("stain") use("shelf") use("safe")
  World.player.x = 340
  World.useObject(obj("drawer"))
  untilTrue(function() return UI.modal == "map" end, 30)
  shot("kalka")
  local mx, my = UI.mapOrigin()
  UI.kalka.x, UI.kalka.y = mx, my
  UI.mousereleased(0, 0, 1)
  untilTrue(function() return G.flags.phoneDone end, 120)
  idle() shot("office")
  exitBy("back", "admin_corridor")
  untilTrue(function() return World.sc.danger end, 30)
  freezeWhile(function()
    if not T.shotN and World.sc.enemies[1] and World.sc.enemies[1].x > World.player.x - 120 then T.shotN = true shot("nameless") end
    return not World.sc.v.namelessResult
  end, 90)
  if World.sc.v.namelessResult ~= "ok" then error("пойман Безымянными, хотя замер") end
  untilTrue(function() return G.flags.namelessDone end, 30)
  idle()
  exitBy("back", "mirror")
  exitBy("krots", "krots")
  idle() shot("krots")
  use("leha") use("bag") use("skull")
  exitBy("breach", "monastyrskaya")
  walk(400) idle()
  local evs = World.sc.def.listen[1]
  Script.run(function() evs.onRecord(World.sc) end, true)
  untilTrue(function() return G.flags.evdShown end, 30) idle()
  shot("evdokia")
  use("niche")
  exitBy("depot", "depot")
  use("floor") use("altar") use("notes") use("scheme") use("battery") use("rosary") use("candle")
  untilTrue(function() return World.sc.danger end, 20)
  idle()
  walk(1030)
  local pr = World.sc.enemies[1]
  freezeWhile(function()
    if not T.shotD and pr.x < World.player.x + 120 then T.shotD = true shot("depot_chase") end
    return pr.x > World.player.x - 140
  end, 120)
  if World.sceneId ~= "depot" then error("пойман Проповедником") end
  World.player.tx = 1560
  scene("monastyrskaya")
  scene("monastyrskaya") idle()
  use("niche")
  untilTrue(function() return G.flags.rest_evd end, 30) idle()
  shot("evd_rest")
  exitBy("flood", "flooded")
  walk(700) idle() shot("flooded")
  exitBy("exit", "laptev_store")
  use("photo") use("letter")
  untilTrue(function() return World.sc.actors.LAPTEV end, 20) idle()
  use("wall")
  untilTrue(function() return G.flags.wallBroken end, 30) idle()
  shot("laptev")
  use("remains") use("notes")
  exitBy("passage", "glow_tunnel")
  shot("glow")
  exitBy("exit", "lipovaya")
  untilTrue(function() return G.flags.aleshaSeen end, 40) idle()
  shot("alesha")
  use("niche5") use("niche5")
  untilTrue(function() return G.flags.rest_alesha end, 20)
  log("доверие духов", G.trust, "паника", G.panic)
  exitBy("exit5", "tunnel_pokr")
  walk(400) idle() shot("tunnel_pokr")
  exitBy("exit", "pokrovskaya")
  idle() shot("pokrovskaya")
  World.player.x = 560
  World.useObject(obj("plate"))
  untilTrue(function() return World.sc.v.gateOpen end, 120)
  shot("fork")
  if ending == "B" then
    scene("escalator") shot("escalator")
    scene("dawnB") sleep(4) shot("dawnB")
    scene("postcards") sleep(2) shot("postcards")
    scene("finalB") sleep(12) shot("finalB")
  else
    scene("climb_n4") sleep(3) shot("climb")
    scene("dawnA") sleep(3) shot("dawnA")
  end
  untilTrue(function() return App.mode == "title" end, 200)
  log("ПРОХОЖДЕНИЕ ЗАВЕРШЕНО, концовка " .. ending)
  T.done = true
end

function T.start(args)
  ending = args[2] or "B"
  if ending == "scene" then T.only = args[3] end
  local orig = love.keyboard.isDown
  love.keyboard.isDown = function(...)
    if T.hold then
      for _, k in ipairs({ ... }) do if T.hold[k] then return true end end
    end
    return orig(...)
  end
  love.errorhandler = function(msg)
    print("[test] ОШИБКА: " .. tostring(msg))
    print(debug.traceback())
    io.stdout:flush()
    os.exit(1)
  end
  co = coroutine.create(run)
end

-- автоответы на модальные окна
local function autoModal()
  local m = UI.modal
  if m == "choice" then
    local opts = UI.choice.options
    local pick = 1
    for i, o in ipairs(opts) do
      local t = type(o) == "table" and o.text or o
      if ANSWERS[t] then pick = i end
      if t == "Остаться" and ending == "B" and not o.disabled then pick = i end
    end
    UI.modal = nil
    UI.choiceResult = pick
  elseif m == "doc" then UI.modal = nil
  elseif m == "candle" then UI.mini.p = 1
  elseif m == "bricks" then UI.modal = nil UI.miniResult = true
  elseif m == "names" then
    local mm = UI.mini
    local e = mm.list[mm.i]
    for i, o in ipairs(e.options) do if o == e.answer then UI.pickName(i) break end end
  end
end

function T.update(dt)
  T.dt = dt
  T.t = T.t + dt
  if Dialog.cur and Dialog.cur.shown >= Dialog.cur.len then Dialog.skip() end
  if Dialog.cur then Dialog.cur.shown = Dialog.cur.len end
  autoModal()
  if T.done then
    T.quitT = (T.quitT or 0) + dt
    if T.quitT > 1 then love.event.quit(0) end
    return
  end
  local ok, err = coroutine.resume(co)
  if not ok then
    print("[test] ОШИБКА БОТА: " .. tostring(err))
    print(debug.traceback(co))
    io.stdout:flush()
    os.exit(2)
  end
end

return T
