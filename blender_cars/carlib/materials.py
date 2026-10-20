"""Principled-BSDF material presets."""
import bpy

def _principled(name, color=(0.8, 0.8, 0.8), metallic=0.0, rough=0.5, coat=0.0, coat_rough=0.03,
                transmission=0.0, ior=1.45, emission=None, strength=0.0, alpha=1.0, spec=0.5):
    m = bpy.data.materials.get(name)
    if m is not None:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes.get("Principled BSDF")
    inp = p.inputs
    inp["Base Color"].default_value = (*color, 1.0)
    inp["Metallic"].default_value = metallic
    inp["Roughness"].default_value = rough
    inp["IOR"].default_value = ior
    inp["Specular IOR Level"].default_value = spec
    inp["Coat Weight"].default_value = coat
    inp["Coat Roughness"].default_value = coat_rough
    inp["Transmission Weight"].default_value = transmission
    inp["Alpha"].default_value = alpha
    if emission is not None:
        inp["Emission Color"].default_value = (*emission, 1.0)
        inp["Emission Strength"].default_value = strength
    m.diffuse_color = (*color, 1.0)
    return m


def paint(name, color, metallic=0.35, rough=0.32, coat=1.0):
    return _principled(name, color, metallic=metallic, rough=rough, coat=coat, coat_rough=0.02)


def _window_glass(name, tint, base_reflect=0.03):
    """Thin car glass: tinted transparency + fresnel reflection (no refraction, low noise)."""
    m = bpy.data.materials.get(name)
    if m is not None:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    tr.inputs["Color"].default_value = (*tint, 1)
    gl = nt.nodes.new("ShaderNodeBsdfGlossy")
    gl.inputs["Roughness"].default_value = 0.02
    gl.inputs["Color"].default_value = (0.75, 0.75, 0.75, 1)
    lw = nt.nodes.new("ShaderNodeLayerWeight")
    lw.inputs["Blend"].default_value = 0.06
    add = nt.nodes.new("ShaderNodeMath")
    add.operation = "ADD"
    add.use_clamp = True
    add.inputs[1].default_value = base_reflect
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(lw.outputs["Fresnel"], add.inputs[0])
    nt.links.new(add.outputs[0], mix.inputs["Fac"])
    nt.links.new(tr.outputs["BSDF"], mix.inputs[1])
    nt.links.new(gl.outputs["BSDF"], mix.inputs[2])
    nt.links.new(mix.outputs["Shader"], out.inputs["Surface"])
    m.diffuse_color = (*tint, 0.5)
    return m


def glass_tinted():
    return _window_glass("glass_tinted", (0.34, 0.36, 0.38))


def glass_clear():
    return _window_glass("glass_clear", (0.92, 0.92, 0.93), 0.05)


def glass_red():
    return _principled("glass_red", (0.55, 0.02, 0.02), rough=0.05, transmission=0.85, ior=1.5)


def glass_smoke():
    return _window_glass("glass_smoke", (0.12, 0.12, 0.13), 0.05)


def chrome():
    return _principled("chrome", (0.92, 0.92, 0.92), metallic=1.0, rough=0.04)


def alu():
    return _principled("alu_silver", (0.80, 0.80, 0.82), metallic=1.0, rough=0.22)


def gunmetal():
    return _principled("gunmetal", (0.12, 0.12, 0.13), metallic=0.9, rough=0.3)


def black_gloss():
    return _principled("black_gloss", (0.01, 0.01, 0.01), rough=0.08, coat=1.0)


def black_satin():
    return _principled("black_satin", (0.015, 0.015, 0.016), rough=0.38)


def black_matte():
    return _principled("black_matte", (0.02, 0.02, 0.02), rough=0.7)


def carbon():
    m = _principled("carbon", (0.03, 0.03, 0.035), rough=0.25, coat=1.0)
    nt = m.node_tree
    if "Checker" not in nt.nodes:
        chk = nt.nodes.new("ShaderNodeTexChecker")
        chk.name = "Checker"
        chk.inputs["Scale"].default_value = 260.0
        chk.inputs["Color1"].default_value = (0.045, 0.045, 0.05, 1)
        chk.inputs["Color2"].default_value = (0.012, 0.012, 0.014, 1)
        tc = nt.nodes.new("ShaderNodeTexCoord")
        nt.links.new(tc.outputs["Object"], chk.inputs["Vector"])
        nt.links.new(chk.outputs["Color"], nt.nodes["Principled BSDF"].inputs["Base Color"])
    return m


def rubber():
    return _principled("rubber", (0.025, 0.025, 0.025), rough=0.82)


def gap():
    return _principled("panel_gap", (0.003, 0.003, 0.003), rough=0.9, spec=0.1)


def emit(name, color, strength):
    return _principled(name, (color[0] * 0.3, color[1] * 0.3, color[2] * 0.3), rough=0.3,
                       emission=color, strength=strength)


def led_white():
    return emit("led_white", (1.0, 0.97, 0.92), 12.0)


def led_red():
    return emit("led_red", (1.0, 0.03, 0.02), 9.0)


def led_amber():
    return emit("led_amber", (1.0, 0.45, 0.02), 6.0)


def led_cyan():
    return emit("led_cyan", (0.1, 0.85, 1.0), 14.0)


def red_off():
    return _principled("taillight_red", (0.35, 0.01, 0.01), rough=0.1, coat=1.0)


def amber_lens():
    return _principled("amber_lens", (0.9, 0.38, 0.02), rough=0.1, coat=1.0)


def reflector():
    return _principled("reflector", (0.85, 0.85, 0.85), metallic=1.0, rough=0.12)


def leather(name="leather_dark", color=(0.04, 0.04, 0.045)):
    return _principled(name, color, rough=0.55)


def plate_white():
    return _principled("plate_white", (0.85, 0.85, 0.85), rough=0.4)


def brake_disc():
    return _principled("brake_disc", (0.35, 0.35, 0.36), metallic=1.0, rough=0.45)


def caliper(color=(0.6, 0.02, 0.02)):
    return _principled("caliper", color, rough=0.3, coat=1.0)


def screen():
    return emit("screen", (0.25, 0.45, 0.8), 1.5)


def studio_floor():
    return _principled("studio_floor", (0.82, 0.82, 0.83), rough=0.45)
