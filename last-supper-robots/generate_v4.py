import base64
import concurrent.futures
import json
import os
import pathlib
import urllib.request

from PIL import Image

KEY = os.environ["SKILL_IMAGE_GEN_OPENAI_KEY"]
OUT = pathlib.Path(__file__).parent

# Variant C prompt, framed for a wide banner crop: subjects kept in a horizontal
# band with headroom above and below so a 3:1 / 4:1 crop keeps everyone.
PROMPT = (
    "Whimsical painted cartoon illustration, cozy children's-book aesthetic with soft "
    "painterly textures and big rounded shapes: a fun parody of 'The Last Supper' shown as a "
    "wide panoramic banner. A long dinner table stretches across the full width of the image "
    "with cute, colorful cartoon robots all seated together in a row behind it, enjoying a "
    "feast. The good robot sits in the center and glows with a happy golden halo, sparkling "
    "and kind. The naughty red-eyed robot sits right beside the haloed good robot at the "
    "table, leaning in with a cheeky grin, adorable and completely harmless. Surrounding "
    "robots are quirky, pastel-colored, and expressive, waving and cheering. Compose the "
    "robots and table within a wide central horizontal band, with generous simple background "
    "headroom above and below so the image can be cropped into a wide banner. Soft warm "
    "candlelight, pastel palette, playful and heartwarming, absolutely not scary."
)

# Crop targets (width, height) applied to the 1536x1024 source, centered.
CROPS = {
    "banner_3x1": (1536, 512),
    "banner_4x1": (1536, 384),
    "banner_2p5x1": (1536, 614),
}


def center_crop(img, tw, th):
    w, h = img.size
    left = (w - tw) // 2
    top = (h - th) // 2
    return img.crop((left, top, left + tw, top + th))


def generate():
    import time
    body = json.dumps({
        "model": "gpt-image-2",
        "prompt": PROMPT,
        "n": 1,
        "size": "1536x1024",
        "quality": "high",
    }).encode()
    data = None
    for attempt in range(1, 5):
        req = urllib.request.Request(
            "https://api.openai.com/v1/images/generations",
            data=body,
            headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=300) as resp:
                data = json.load(resp)
            break
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 520, 524) and attempt < 4:
                print(f"attempt {attempt}: HTTP {e.code}, retrying...")
                time.sleep(3 * attempt)
                continue
            raise
    d = data["data"][0]
    if d.get("b64_json"):
        raw = base64.b64decode(d["b64_json"])
    else:
        with urllib.request.urlopen(d["url"], timeout=120) as r:
            raw = r.read()
    src = OUT / "v4_c_banner_source.png"
    src.write_bytes(raw)
    print(f"source: saved {src} ({len(raw)} bytes)")
    return src


src = generate()
img = Image.open(src)
for name, (tw, th) in CROPS.items():
    out = OUT / f"v4_c_{name}.png"
    center_crop(img, tw, th).save(out)
    print(f"{name}: saved {out} ({tw}x{th})")
