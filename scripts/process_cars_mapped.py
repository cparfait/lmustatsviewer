# Variante avec table de correspondance timestamp -> slug (captures non nommées).
import os
from PIL import Image
from rembg import remove, new_session

SRC = os.path.join(os.path.dirname(__file__), "..", "_incoming_cars")
OUT = os.path.join(SRC, "out")
os.makedirs(OUT, exist_ok=True)

# timestamp présent dans le nom de fichier  ->  slug LMU
MAP = {
    "171500": "aston-martin-vantage-amr-gte",
    "171451": "chevrolet-corvette-c8-r-gte",
    "165357": "oreca-07-gibson",
    "165429": "isotta-fraschini-tipo-6-c",
    "165451": "lamborghini-sc63",
    "165522": "porsche-963",
    "165539": "toyota-gr010-hybrid",
    "165553": "aston-martin-vantage-amr-lmgt3-evo",
    "165604": "bmw-m4-lmgt3",
    "165614": "chevrolet-corvette-z06-lmgt3-r",
    "165625": "ferrari-296-lmgt3",
    "165635": "ford-mustang-lmgt3",
    "165643": "lamborghini-huracan-lmgt3-evo-2",
    "165654": "lexus-rc-f-lmgt3",
    "165704": "mclaren-720s-lmgt3-evo",
    "165715": "porsche-911-gt3-r-lmgt3",
    "165744": "vanwall-vandervell-680",
    "165753": "glickenhaus-007-lmh",
    "165807": "peugeot-9x8",
    "165836": "ferrari-488-gte-evo",
    "165849": "porsche-911-rsr-19",
    "165917": "adess-ad25",
    "165929": "duqueine-d09",
    "165939": "ginetta-g61-lt-p325-evo",
    "165956": "ligier-js-p325",
    "170012": "mercedes-amg-lmgt3",
}

TARGET_W = 700
PAD = 0.015
session = new_session("isnet-general-use")

def process(path):
    im = Image.open(path).convert("RGBA")
    cut = remove(im, session=session, alpha_matting=True,
                 alpha_matting_foreground_threshold=240,
                 alpha_matting_background_threshold=15,
                 alpha_matting_erode_size=8, post_process_mask=True)
    bbox = cut.getbbox()
    if bbox:
        cut = cut.crop(bbox)
    w, h = cut.size
    pad = int(max(w, h) * PAD)
    canvas = Image.new("RGBA", (w + 2 * pad, h + 2 * pad), (0, 0, 0, 0))
    canvas.paste(cut, (pad, pad), cut)
    cw, ch = canvas.size
    if cw > TARGET_W:
        canvas = canvas.resize((TARGET_W, round(ch * TARGET_W / cw)), Image.LANCZOS)
    return canvas

def main():
    files = [f for f in os.listdir(SRC)
             if f.lower().endswith((".png", ".jpg", ".jpeg", ".webp"))
             and os.path.isfile(os.path.join(SRC, f))]
    done = 0
    for f in files:
        slug = next((s for ts, s in MAP.items() if ts in f), None)
        if not slug:
            print(f"  ? non mappé : {f}")
            continue
        out = process(os.path.join(SRC, f))
        out.save(os.path.join(OUT, slug + ".png"), "PNG", optimize=True)
        print(f"  {slug}.png  ({out.size[0]}x{out.size[1]})")
        done += 1
    print(f"Total traité : {done}/{len(files)}")

if __name__ == "__main__":
    main()
