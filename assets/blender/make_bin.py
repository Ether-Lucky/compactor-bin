"""Build the compactor bin 3D model from data/parts.js (SPEC 6.5).

Run from the repo root (Blender 5.x):
    blender --background --python assets/blender/make_bin.py

Writes:
    assets/models/compactor_bin.glb        normal model file
    assets/models/compactor_bin.model.js   same model as base64, loadable by a double-clicked page
    assets/blender/compactor_bin.blend     Blender file for hand editing

Blender axes: X = width (left/right), Y = depth (front is -Y), Z = up. Units: metres.
The glTF export converts to Y-up, so in the browser front faces +Z.
Moving parts have their origin at the real hinge or mount point.
"""
import base64
import json
import math
import os

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))


def load_parts():
    src = open(os.path.join(ROOT, "data", "parts.js"), encoding="utf-8").read()
    start = src.index("= {") + 2
    end = src.rindex("}") + 1
    return json.loads(src[start:end])


PARTS = load_parts()
G = {k: v["v"] / 1000.0 for k, v in PARTS["geometry"].items()}  # mm -> m

# ---------------------------------------------------------------- scene
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = "METRIC"

MATS = {}


def mat(name, rgb, metal=0.0, rough=0.6, alpha=1.0):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    m.diffuse_color = (rgb[0], rgb[1], rgb[2], alpha)
    try:
        m.use_nodes = True
    except Exception:
        pass
    nt = getattr(m, "node_tree", None)
    if nt:
        bsdf = nt.nodes.get("Principled BSDF")
        if bsdf:
            bsdf.inputs["Base Color"].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
            bsdf.inputs["Metallic"].default_value = metal
            bsdf.inputs["Roughness"].default_value = rough
    MATS[name] = m
    return m


M = {
    "plywood": mat("plywood", (0.62, 0.45, 0.25), 0.0, 0.8),
    "pvc": mat("pvc_board", (0.86, 0.87, 0.88), 0.0, 0.5),
    "steel": mat("steel", (0.55, 0.57, 0.6), 0.85, 0.35),
    "alu": mat("aluminum", (0.78, 0.8, 0.83), 0.9, 0.3),
    "dark": mat("dark_plastic", (0.06, 0.06, 0.07), 0.0, 0.5),
    "red": mat("red", (0.75, 0.06, 0.04), 0.0, 0.4),
    "yellow": mat("yellow", (0.95, 0.75, 0.05), 0.0, 0.4),
    "blue_pcb": mat("blue_pcb", (0.03, 0.22, 0.55), 0.1, 0.5),
    "sensor_eye": mat("sensor_eye", (0.75, 0.77, 0.8), 0.9, 0.25),
    "psu": mat("psu_metal", (0.7, 0.72, 0.74), 0.8, 0.4),
    "led_g": mat("led_green", (0.05, 0.5, 0.15), 0.0, 0.3),
    "led_y": mat("led_yellow", (0.6, 0.45, 0.02), 0.0, 0.3),
    "led_r": mat("led_red", (0.6, 0.05, 0.03), 0.0, 0.3),
    "hose": mat("hose", (0.15, 0.35, 0.7), 0.0, 0.6),
}


def link(obj, parent=None):
    scene.collection.objects.link(obj)
    if parent is not None:
        obj.parent = parent
    return obj


def box(name, size, center, material, pivot=None, parent=None):
    """Axis-aligned box. `pivot` (world) becomes the object's origin."""
    sx, sy, sz = size
    cx, cy, cz = center
    px, py, pz = pivot if pivot else center
    hx, hy, hz = sx / 2, sy / 2, sz / 2
    v = [(cx + dx - px, cy + dy - py, cz + dz - pz) for dx in (-hx, hx) for dy in (-hy, hy) for dz in (-hz, hz)]
    faces = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    me = bpy.data.meshes.new(name)
    me.from_pydata(v, [], faces)
    me.update()
    me.materials.append(material)
    ob = bpy.data.objects.new(name, me)
    ob.location = (px, py, pz)
    return link(ob, parent)


def cyl(name, radius, depth, center, material, axis="Z", verts=24, radius2=None):
    """Cylinder (or cone when radius2 is given) built from vertices."""
    r2 = radius if radius2 is None else radius2
    pts = []
    for i in range(verts):
        a = 2 * math.pi * i / verts
        pts.append((math.cos(a), math.sin(a)))
    v = [(radius * c, radius * s, depth / 2) for c, s in pts] + [(r2 * c, r2 * s, -depth / 2) for c, s in pts]
    faces = [tuple(range(verts - 1, -1, -1)), tuple(range(verts, 2 * verts))]
    for i in range(verts):
        j = (i + 1) % verts
        faces.append((i, j, verts + j, verts + i))
    if axis == "X":
        v = [(z, y, -x) for x, y, z in v]
    elif axis == "Y":
        v = [(x, z, -y) for x, y, z in v]
    me = bpy.data.meshes.new(name)
    me.from_pydata(v, [], faces)
    me.update()
    for p in me.polygons:
        p.use_smooth = len(p.vertices) == 4
    me.materials.append(material)
    ob = bpy.data.objects.new(name, me)
    ob.location = center
    return link(ob)


# ---------------------------------------------------------------- dimensions
W, D, t = G["inner_w"], G["inner_d"], G["wall"]
zS0 = G["base_h"]
zS1 = zS0 + G["storage_h"]
zC1 = zS1 + G["chamber_h"]
zH1 = zC1 + G["housing_h"]
total = zH1
slot, tube, rec = G["slot_w"], G["slot_len"], G["sensor_recess"]
zc = (zS1 + zC1) / 2
yF = -D / 2  # inner face of the front wall
yFo = yF - t  # outer face

# ---------------------------------------------------------------- body
box("wall_left", (t, D + 2 * t, total + t), (-W / 2 - t / 2, 0, (total + t) / 2), M["plywood"])
box("wall_right", (t, D + 2 * t, total + t), (W / 2 + t / 2, 0, (total + t) / 2), M["plywood"])
box("wall_back", (W, t, total + t), (0, D / 2 + t / 2, (total + t) / 2), M["plywood"])
box("top", (W + 2 * t, D + 2 * t, t), (0, 0, total + t / 2), M["plywood"])
box("housing_floor", (W, D, 0.006), (0, 0, zC1 + 0.003), M["pvc"])
box("storage_floor", (W, D, 0.003), (0, 0, zS0 - 0.0015), M["steel"])

# front panels (go see-through in cutaway)
fy = yF - t / 2
box("front_housing", (W, t, G["housing_h"]), (0, fy, (zC1 + zH1) / 2), M["plywood"])
side_w = (W - slot) / 2
box("front_chamber_left", (side_w, t, G["chamber_h"]), (-W / 2 + side_w / 2, fy, zc), M["plywood"])
box("front_chamber_right", (side_w, t, G["chamber_h"]), (W / 2 - side_w / 2, fy, zc), M["plywood"])
box("front_chamber_top", (slot, t, zC1 - (zc + slot / 2)), (0, fy, (zC1 + zc + slot / 2) / 2), M["plywood"])
box("front_chamber_bottom", (slot, t, (zc - slot / 2) - zS1), (0, fy, (zS1 + zc - slot / 2) / 2), M["plywood"])
box("front_base", (W, t, zS0), (0, fy, zS0 / 2), M["plywood"])
# storage door, hinged on its left edge
box("door", (W, t, G["storage_h"]), (0, fy, (zS0 + zS1) / 2), M["plywood"], pivot=(-W / 2, fy, (zS0 + zS1) / 2))
box("door_handle", (0.012, 0.025, 0.12), (W / 2 - 0.04, yFo - 0.0125, (zS0 + zS1) / 2), M["dark"])

# slot tube (PVC board)
ty = yFo - tube / 2
pt = 0.006
box("slot_tube_top", (slot + 2 * pt, tube, pt), (0, ty, zc + slot / 2 + pt / 2), M["pvc"])
box("slot_tube_bottom", (slot + 2 * pt, tube, pt), (0, ty, zc - slot / 2 - pt / 2), M["pvc"])
box("slot_tube_left", (pt, tube, slot), (-slot / 2 - pt / 2, ty, zc), M["pvc"])
box("slot_tube_right", (pt, tube, slot), (slot / 2 + pt / 2, ty, zc), M["pvc"])

# lid: inside the chamber, hinged at the top edge of the opening
lid_s = slot + 0.02
box("lid", (lid_s, 0.004, lid_s), (0, yF + 0.004, zc), M["alu"], pivot=(0, yF + 0.004, zc + lid_s / 2))
box("servo", (0.04, 0.02, 0.038), (slot / 2 + 0.05, yF + 0.012, zc + slot / 2 + 0.025), M["dark"])
box("servo_horn", (0.03, 0.004, 0.006), (slot / 2 + 0.02, yF + 0.006, zc + slot / 2 + 0.01), M["dark"])


def hcsr04(name, center, facing_down=True):
    x, y, z = center
    box(name, (0.045, 0.02, 0.0016), (x, y, z), M["blue_pcb"])
    dz = -0.0065 if facing_down else 0.0065
    for i, dx in enumerate((-0.013, 0.013)):
        cyl(name + "_eye" + str(i + 1), 0.008, 0.012, (x + dx, y, z + dz), M["sensor_eye"])


hcsr04("sensor_slot1", (0, ty, zc + slot / 2 + rec), True)
hcsr04("sensor_slot2", (0, ty, zc - slot / 2 - rec), False)
cyl("sensor_metal", 0.006, 0.05, (0, yFo - 0.03, zc - slot / 2 - 0.04), M["steel"])
hcsr04("sensor_fill", (W / 2 - 0.07, D / 2 - 0.03, zS1 - 0.02), True)

# actuators, rods, plate
plate_t = G["plate_t"]
plate_top = zC1 - 0.002
for i, x in enumerate((-G["act_offset"], G["act_offset"]), start=1):
    body_top = zH1 - 0.01
    body_bot = body_top - G["act_len"]
    box("actuator_%d_body" % i, (0.04, 0.04, G["act_len"]), (x, 0, (body_top + body_bot) / 2), M["alu"])
    cyl("actuator_%d_motor" % i, 0.018, 0.1, (x + 0.038, 0, body_top - 0.06), M["alu"])
    box("actuator_%d_mount" % i, (0.06, 0.05, 0.008), (x, 0, body_top + 0.004), M["steel"])
    rod_len = 0.22
    cyl("rod_%d" % i, 0.01, rod_len, (x, 0, plate_top + rod_len / 2), M["steel"])
box("plate", (W - 0.02, D - 0.02, plate_t), (0, 0, plate_top - plate_t / 2), M["steel"])

# trapdoor flaps: hinged at the front and back walls, top face = chamber floor
tt = G["trap_t"]
box("trap_front", (W, D / 2, tt), (0, -D / 4, zS1 - tt / 2), M["plywood"], pivot=(0, -D / 2, zS1))
box("trap_back", (W, D / 2, tt), (0, D / 4, zS1 - tt / 2), M["plywood"], pivot=(0, D / 2, zS1))

# electronics bay along the back of the housing
shelf_z = zC1 + 0.006
box("psu12", (0.199, 0.098, 0.042), (-W / 2 + 0.11, D / 2 - 0.055, shelf_z + 0.021), M["psu"])
box("psu5", (0.159, 0.098, 0.038), (W / 2 - 0.09, D / 2 - 0.055, shelf_z + 0.019), M["psu"])
box("shelf", (W, 0.09, 0.01), (0, D / 2 - 0.045, zC1 + 0.2), M["plywood"])
box("arduino", (0.069, 0.053, 0.012), (-0.13, D / 2 - 0.045, zC1 + 0.211), M["blue_pcb"])
box("bts", (0.05, 0.05, 0.043), (0.0, D / 2 - 0.045, zC1 + 0.2265), M["blue_pcb"])
box("fuse", (0.04, 0.02, 0.02), (0.08, D / 2 - 0.045, zC1 + 0.215), M["dark"])
box("terminal", (0.07, 0.015, 0.018), (0.15, D / 2 - 0.045, zC1 + 0.214), M["dark"])
box("buck", (0.045, 0.025, 0.012), (-0.06, D / 2 - 0.045, zC1 + 0.211), M["blue_pcb"])

# front control panel on the housing
pz = zH1 - 0.07
for name, x, m in (("led_green", -0.14, M["led_g"]), ("led_yellow", -0.115, M["led_y"]), ("led_red", -0.09, M["led_r"])):
    cyl(name, 0.005, 0.008, (x, yFo - 0.004, pz), m, axis="Y")
cyl("buzzer", 0.012, 0.01, (-0.05, yFo - 0.005, pz), M["dark"], axis="Y")
cyl("button", 0.011, 0.012, (0.05, yFo - 0.006, pz), M["red"], axis="Y")
cyl("estop_base", 0.022, 0.03, (0.13, yFo - 0.015, pz - 0.01), M["yellow"], axis="Y")
cyl("estop", 0.02, 0.018, (0.13, yFo - 0.039, pz - 0.01), M["red"], axis="Y")

# base: drain funnel and hose
cyl("funnel", W * 0.45, zS0 * 0.6, (0, 0, zS0 - zS0 * 0.3 - 0.004), M["steel"], radius2=0.015)
cyl("hose", 0.012, D / 2 + t + 0.06, (0, (D / 2 + t + 0.06) / 2, zS0 * 0.25), M["hose"], axis="Y")

# ---------------------------------------------------------------- export
models = os.path.join(ROOT, "assets", "models")
os.makedirs(models, exist_ok=True)
glb = os.path.join(models, "compactor_bin.glb")
bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB", export_yup=True, export_apply=False)
with open(glb, "rb") as fh:
    data = base64.b64encode(fh.read()).decode("ascii")
with open(os.path.join(models, "compactor_bin.model.js"), "w", encoding="utf-8") as fh:
    fh.write("/* Generated by assets/blender/make_bin.py from data/parts.js. Do not edit by hand. */\n")
    fh.write('window.MODEL_GLB_BASE64 = "' + data + '";\n')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, "compactor_bin.blend"))
print("MAKE_BIN_OK", glb, os.path.getsize(glb), "bytes")
