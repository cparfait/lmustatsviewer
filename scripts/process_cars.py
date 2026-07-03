# Détourage IA + recadrage + redimensionnement des captures de voitures.
# Entrée : _incoming_cars/*.png|jpg  →  Sortie : _incoming_cars/out/<slug>.png (transparent)
import os, io, sys
from PIL import Image
from rembg import remove, new_session

SRC = os.path.join(os.path.dirname(__file__), "..", "_incoming_cars")
OUT = os.path.join(SRC, "out")
os.makedirs(OUT, exist_ok=True)

TARGET_W = 700          # largeur cible
PAD = 0.015             # marge après rognage (1.5 %)

session = new_session("isnet-general-use")  # modèle « objet » net

def process(path):
    im = Image.open(path).convert("RGBA")
    # 1) détourage IA (mask post-traité + alpha matting pour des bords propres)
    cut = remove(
        im,
        session=session,
        alpha_matting=True,
        alpha_matting_foreground_threshold=240,
        alpha_matting_background_threshold=15,
        alpha_matting_erode_size=8,
        post_process_mask=True,
    )
    # 2) rognage sur le contenu non transparent
    bbox = cut.getbbox()
    if bbox:
        cut = cut.crop(bbox)
    # 3) marge transparente uniforme
    w, h = cut.size
    pad = int(max(w, h) * PAD)
    canvas = Image.new("RGBA", (w + 2 * pad, h + 2 * pad), (0, 0, 0, 0))
    canvas.paste(cut, (pad, pad), cut)
    # 4) redimensionnement (sans upscale au-delà de l'original)
    cw, ch = canvas.size
    if cw > TARGET_W:
        nh = round(ch * TARGET_W / cw)
        canvas = canvas.resize((TARGET_W, nh), Image.LANCZOS)
    return canvas

def main():
    files = [f for f in sorted(os.listdir(SRC))
             if f.lower().endswith((".png", ".jpg", ".jpeg", ".webp"))
             and os.path.isfile(os.path.join(SRC, f))]
    for f in files:
        slug = os.path.splitext(f)[0]
        out = process(os.path.join(SRC, f))
        dst = os.path.join(OUT, slug + ".png")
        out.save(dst, "PNG", optimize=True)
        print(f"{f}  ->  out/{slug}.png  ({out.size[0]}x{out.size[1]})")

if __name__ == "__main__":
    main()
