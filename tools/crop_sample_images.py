# 新UIモック用の仮画像を、25画面デザイン参考画像から切り出す。
# 使い方: python tools/crop_sample_images.py <参考画像フォルダー> studio/assets/samples
import sys, os, glob
from PIL import Image
import colorsys
src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
def img(n): return Image.open(glob.glob(os.path.join(src, f'{n}_*.png'))[0]).convert('RGB')
# (ref, name, box, width)
C = [
 ('08','char-shuka',(252,228,392,308),280),('08','char-yukino',(408,228,534,308),280),('08','char-sakuna',(550,228,676,308),280),
 ('08','stage-shrine',(692,250,840,308),360),('08','stage-sakura-path',(888,228,1106,308),360),('08','stage-city-night',(1123,228,1346,308),360),
 ('08','prop-lantern',(253,380,375,452),240),('08','prop-fan',(393,380,519,452),240),('08','prop-mask',(537,380,659,452),240),('08','prop-stone-lantern',(677,380,794,452),240),
 ('08','tex-washi',(810,380,936,452),240),('08','mat-gold',(953,380,1074,452),240),('08','mat-cloth',(1090,380,1210,452),240),('08','fx-petals',(1226,380,1347,452),240),
 ('08','fx-fireworks',(252,522,374,592),240),('08','fx-sakura-storm',(390,522,514,592),240),('08','fx-aura',(530,522,654,592),240),('08','fx-light-stream',(670,522,791,592),240),
 ('08','audio-bgm',(808,522,928,592),240),('08','audio-bell',(944,522,1071,592),240),('08','motion-dance',(1087,522,1209,592),240),('08','motion-walk',(1224,522,1347,592),240),
 ('08','video-teaser',(252,662,371,716),240),('08','img-bg-night',(388,662,506,716),240),('08','img-logo',(522,662,639,716),240),('08','img-silhouette',(654,662,771,716),240),
 ('08','fx-particles',(1050,662,1199,716),240),('08','hdr-moon',(1215,662,1347,716),240),
 ('08','preview-shrine',(1384,168,1622,290),560),
 ('01','hero',(650,84,1078,330),900),
 ('01','proj-city-night',(201,412,446,498),400),('01','proj-blue-resonance',(459,412,690,498),400),('01','proj-sakura-dance',(704,412,935,498),400),('01','proj-virtual-stage',(948,412,1180,498),400),
 ('01','render-city',(200,822,300,862),240),('01','render-sakura',(336,822,436,862),240),('01','render-blue',(471,822,571,862),240),('01','render-stage',(607,822,707,862),240),
 ('01','asset-crystal',(878,826,975,884),200),('01','asset-dress',(985,826,1080,884),200),('01','asset-neon',(1090,826,1184,884),200),
 ('02','viewport-camera',(232,165,925,545),1280),
 ('02','shot-01',(298,661,366,700),200),('02','shot-02',(444,661,512,700),200),('02','shot-03',(606,661,682,700),200),('02','shot-04',(758,661,832,700),200),('02','shot-05',(900,661,966,700),200),
 ('02','preset-default',(1155,207,1215,262),160),('02','preset-cinematic',(1221,207,1269,262),160),('02','preset-portrait',(1275,207,1324,262),160),('02','preset-dynamic',(1331,207,1380,262),160),('02','preset-drone',(1387,207,1436,262),160),
 ('02','lens-35',(1461,209,1551,262),200),('02','lens-85',(1561,209,1651,262),200),('02','lens-24',(1461,290,1551,342),200),('02','lens-135',(1561,290,1651,342),200),
 ('06','viewport-shrine',(362,142,990,655),1280),
 ('06','tpl-cinematic',(24,713,146,772),240),('06','tpl-closeup',(158,713,280,772),240),('06','tpl-dynamic',(24,795,146,845),240),('06','tpl-lowangle',(158,795,280,845),240),
 ('06','tpl-highangle',(24,866,146,915),240),('06','tpl-dollyin',(158,866,280,915),240),('06','tpl-orbit',(24,936,146,985),240),('06','tpl-handheld',(158,936,280,985),240),
 ('06','camshot-01',(24,125,114,180),180),('06','camshot-02',(24,190,114,245),180),('06','camshot-03',(24,256,114,311),180),('06','camshot-04',(24,321,114,376),180),('06','camshot-05',(24,387,114,442),180),
 ('12','viewport-character',(330,205,770,600),1100),
 ('12','char-baisound',(24,272,92,333),160),('12','char-s01',(106,272,172,333),160),('12','char-s02',(186,272,252,333),160),('12','char-s03',(24,364,92,423),160),('12','char-s04',(106,364,172,423),160),('12','char-s05',(186,364,252,423),160),
]
def tame(im):
    # 紫〜マゼンタ（AIっぽい色）だけ彩度を落とし、色相を青寄り/暖色寄りに少しずらす
    px = im.load(); w, hgt = im.size
    for y in range(hgt):
        for x in range(w):
            r, g, b = px[x, y]
            h, s, v = colorsys.rgb_to_hsv(r/255, g/255, b/255)
            deg = h*360
            if 245 <= deg <= 320 and s > 0.15:
                k = 1 - min(1, (min(deg-245, 320-deg))/20)  # 端はなめらかに
                k = 1 - k
                s *= 1 - 0.55*k
                deg = deg - 22*k if deg < 285 else deg + 30*k
                h = (deg % 360)/360
                r2, g2, b2 = colorsys.hsv_to_rgb(h, s, v)
                px[x, y] = (int(r2*255), int(g2*255), int(b2*255))
    return im
total = 0
for ref, name, box, wd in C:
    im = img(ref).crop(box)
    hh = round(im.height * wd / im.width)
    im = im.resize((wd, hh), Image.LANCZOS)
    im = tame(im)
    p = os.path.join(out, name + '.webp'); im.save(p, 'WEBP', quality=74, method=6)
    total += os.path.getsize(p)
print(len(C), 'files', total//1024, 'KB')
