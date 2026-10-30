function love.conf(t)
  t.identity = "pod_fundamentom"
  t.version = "11.5"
  t.console = false
  t.window.title = "Под фундаментом"
  t.window.width = 1440
  t.window.height = 810
  t.window.minwidth = 480
  t.window.minheight = 270
  t.window.resizable = true
  t.window.vsync = 1
  t.modules.joystick = false
  t.modules.physics = false
  t.modules.video = false
  t.modules.touch = false
end
