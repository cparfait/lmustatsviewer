# Nettoie le détourage : ne garde que le personnage (la piste à droite est retirée).
import sys
from PIL import Image, ImageDraw, ImageFilter
src, out, preview = sys.argv[1], sys.argv[2], sys.argv[3]
im = Image.open(src).convert("RGBA")
poly = [(128,12),(372,12),(378,135),(395,140),(425,160),(428,215),(400,232),(352,250),
        (338,258),(318,282),(318,345),(321,352),(321,402),(300,404),(298,420),(322,430),
        (342,440),(357,450),(364,462),(363,479),(138,479),(136,426),
        (186,418),(186,350),(170,320),(166,256),(120,238),(84,222),(80,160),(112,140),(130,140)]
mask = Image.new("L", im.size, 0)
d = ImageDraw.Draw(mask)
d.polygon(poly, fill=255)
# piste visible entre les jambes
d.polygon([(255,403),(272,403),(272,420),(262,426),(262,478),(240,478),(240,426),(234,420),(236,403)], fill=0)
mask = mask.filter(ImageFilter.GaussianBlur(1.2))
r,g,b,a = im.split()
a = Image.fromarray(__import__("numpy").minimum(__import__("numpy").array(a), __import__("numpy").array(mask)))
im.putalpha(a)
bbox = im.getbbox()
im = im.crop(bbox)
print("bbox", bbox, "size", im.size)
im.save(out)
bg = Image.new("RGBA", im.size, (255,0,255,255)); bg.alpha_composite(im)
bg = bg.resize((im.size[0]*2, im.size[1]*2), Image.NEAREST); bg.save(preview)
