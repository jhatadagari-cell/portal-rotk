"""
blender_iso_render.py — Render de assets isométricos CONSISTENTES para el juego.
────────────────────────────────────────────────────────────────────────────────
El problema de la IA 2D es que cada imagen es una "cámara" distinta → la
perspectiva nunca cuadra en la rejilla. Esto lo resuelve de raíz: UNA cámara
ORTOGRÁFICA a un ángulo EXACTO renderiza todos los modelos con la MISMA
proyección y las MISMAS luces. Estilo y perspectiva consistentes, para siempre.

USO
  1. Abre Blender. Coloca tu(s) modelo(s) low-poly en una colección llamada
     "Assets" (cada edificio como un objeto/empty-padre; se renderiza uno a uno).
     El modelo debe estar apoyado en Z=0 y centrado en el origen (XY).
  2. Pega este script en el editor de Texto de Blender y pulsa "Run Script"
     (o: blender archivo.blend --background --python tools/blender_iso_render.py).
  3. Salen los PNG en OUT_DIR, con fondo transparente, uno por objeto.

AJUSTES rápidos abajo (RATIO, PX_PER_TILE, OUT_DIR).

MATEMÁTICA DEL ÁNGULO
  Con cámara ortográfica en azimut 45°, una casilla cuadrada del suelo se
  proyecta como un rombo de ancho:alto = 1 : sin(θ), donde θ = elevación de la
  cámara sobre el horizonte. Por tanto:
      RATIO (ancho:alto)  →  θ = asin(1 / RATIO)
      2.00 (2:1 clásico)  →  θ = 30.0°   (cámara pitch 60°)
      1.38 (tu tileset)   →  θ = 46.5°   (cámara pitch 43.5°)
  La cámara mira SIEMPRE hacia el origen; el pitch = 90° − θ.
"""

import bpy, math
from mathutils import Vector

# ── AJUSTES ───────────────────────────────────────────────────────────────
RATIO        = 1.38          # ancho:alto del rombo del suelo (2.0 = 2:1 clásico)
PX_PER_TILE  = 128           # px de ancho que ocupa UNA casilla del suelo en el render
                             # (súbelo para más resolución; luego escalas/retocas)
MARGIN       = 1.08          # holgura alrededor del modelo (1.0 = ajustado)
OUT_DIR      = "//iso_out/"  # relativo al .blend (// = carpeta del .blend)
COLLECTION   = "Assets"      # colección con los objetos a renderizar (uno por PNG)
SUN_ENERGY   = 3.0
AMBIENT      = 0.35          # luz de relleno para que las sombras no queden negras
# ──────────────────────────────────────────────────────────────────────────

theta = math.asin(1.0 / RATIO)          # elevación de la cámara
azim  = math.radians(45.0)

def frame_pixels():
    # ancho en píxeles del rombo de 1 casilla = PX_PER_TILE. El rombo mide
    # sqrt(2) en X-proyectado por casilla de lado 1 → escala de resolución.
    return PX_PER_TILE

def setup_world():
    scn = bpy.context.scene
    scn.render.engine = 'BLENDER_EEVEE' if 'BLENDER_EEVEE' in \
        [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'CYCLES'
    scn.render.film_transparent = True
    scn.render.image_settings.file_format = 'PNG'
    scn.render.image_settings.color_mode = 'RGBA'
    # Luz de sol fija (misma para todos → sombras/tono consistentes)
    if 'ISO_SUN' not in bpy.data.objects:
        light = bpy.data.lights.new('ISO_SUN', 'SUN'); light.energy = SUN_ENERGY
        obj = bpy.data.objects.new('ISO_SUN', light); scn.collection.objects.link(obj)
        obj.rotation_euler = (math.radians(55), 0, math.radians(35))
    # Ambiente
    scn.world = scn.world or bpy.data.worlds.new('W')
    scn.world.use_nodes = True
    bg = scn.world.node_tree.nodes.get('Background')
    if bg: bg.inputs[1].default_value = AMBIENT

def make_camera():
    if 'ISO_CAM' in bpy.data.objects:
        cam = bpy.data.objects['ISO_CAM']
    else:
        c = bpy.data.cameras.new('ISO_CAM'); cam = bpy.data.objects.new('ISO_CAM', c)
        bpy.context.scene.collection.objects.link(cam)
    cam.data.type = 'ORTHO'
    # Posición: sobre una esfera, azimut 45°, elevación θ, mirando al origen.
    d = 50.0
    cam.location = Vector((
        d * math.cos(theta) * math.cos(azim),
        -d * math.cos(theta) * math.sin(azim),
        d * math.sin(theta),
    ))
    # Orientar hacia el origen
    direction = -cam.location.normalized()
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = cam
    return cam

def fit_ortho(cam, obj):
    # Encuadra el objeto: ortho_scale = tamaño proyectado mayor.
    bb = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    # proyecta a plano de cámara
    mv = cam.matrix_world.inverted()
    xs = [ (mv @ p).x for p in bb ]; ys = [ (mv @ p).y for p in bb ]
    w = (max(xs) - min(xs)); h = (max(ys) - min(ys))
    cam.data.ortho_scale = max(w, h) * MARGIN
    # centra la cámara sobre el objeto
    ctr = sum(bb, Vector()) / 8.0
    cam.location += (ctr - Vector((0,0,0)))
    # recalcula orientación hacia el centro del objeto
    cam.rotation_euler = (ctr - cam.location).normalized().to_track_quat('-Z','Y').to_euler()
    return w, h

def render_all():
    setup_world()
    cam = make_camera()
    coll = bpy.data.collections.get(COLLECTION)
    if not coll:
        print("!! No existe la colección '%s'. Crea una y mete tus modelos." % COLLECTION); return
    objs = [o for o in coll.objects if o.parent is None]
    scn = bpy.context.scene
    # resolución: rombo de 1 casilla = PX_PER_TILE de ancho. ortho_scale abarca
    # 'unidades' del mundo; casilla de lado 1 → ancho proyectado sqrt(2).
    for o in objs:
        base_loc = cam.location.copy(); base_rot = cam.rotation_euler.copy()
        w, h = fit_ortho(cam, o)
        px_per_unit = PX_PER_TILE / math.sqrt(2.0)   # 1 casilla lado-1 = sqrt2 de ancho
        res = max(64, int(cam.data.ortho_scale * px_per_unit))
        scn.render.resolution_x = res; scn.render.resolution_y = res
        # aísla el objeto
        for other in objs:
            other.hide_render = (other is not o)
        scn.render.filepath = OUT_DIR + o.name + ".png"
        bpy.ops.render.render(write_still=True)
        print("  render:", o.name, "->", scn.render.filepath, "(%dpx)" % res)
        cam.location = base_loc; cam.rotation_euler = base_rot
    for o in objs: o.hide_render = False
    print("Listo. RATIO=%.3f  θ=%.1f°  PNGs en %s" % (RATIO, math.degrees(theta), OUT_DIR))

if __name__ == "__main__":
    render_all()
