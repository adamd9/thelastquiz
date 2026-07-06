import base64
import concurrent.futures
import json
import os
import pathlib
import urllib.request

KEY = os.environ["SKILL_IMAGE_GEN_OPENAI_KEY"]
OUT = pathlib.Path(__file__).parent

PROMPTS = {
    "v2_painted_cartoony_a": (
        "Painted cartoon illustration, soft storybook style with warm textured brushstrokes "
        "but rounded, super cute and cartoony character designs: 'The Last Supper' reimagined "
        "with a jolly crew of adorable chubby robots gathered at a long banquet table, sharing "
        "food and laughing. A cheerful central robot has a bright glowing golden halo and a big "
        "friendly smile, arms open warmly. Beside it, one goofy 'mischief' robot has playful "
        "cartoon red glowing eyes and a cheeky little grin, hiding a bolt behind its back, more "
        "silly than scary. The other robots are wildly varied and endearing, reacting with "
        "cartoon gasps, giggles, and wide happy eyes. Bright warm colors, soft lighting, "
        "wholesome, gentle, and very lighthearted comedic tone."
    ),
    "v2_painted_cartoony_b": (
        "Whimsical painted cartoon illustration, cozy children's-book aesthetic with soft "
        "painterly textures and big rounded shapes: a fun parody of 'The Last Supper' featuring "
        "a table full of cute, colorful cartoon robots enjoying a feast together. The good robot "
        "in the center glows with a happy golden halo, sparkling and kind. One little rascal "
        "robot has bright cartoonish red glowing eyes and a silly sneaky smirk, clearly the "
        "'naughty' one but adorable and harmless. Surrounding robots are quirky, pastel-colored, "
        "and expressive, waving, cheering, and reacting with delight. Soft warm candlelight, "
        "pastel palette, playful and heartwarming, absolutely not scary."
    ),
    "v2_painted_cartoony_c": (
        "Charming painted cartoon illustration blending gentle brushwork with a rounded, "
        "toy-like cartoon style: 'The Last Supper' reimagined as a joyful robot dinner party at "
        "a long table. The central robot beams with a glowing golden halo and a warm smile, "
        "radiating kindness. To the side, one playful trouble-maker robot has cute glowing red "
        "eyes and a mischievous little grin, comically peeking around, more cheeky than "
        "threatening. The rest are a delightful mix of round, boxy, and wobbly robots, all with "
        "big expressive faces reacting with laughter and surprise. Bright saturated colors, "
        "soft warm lighting, bubbly and fun, deeply lighthearted and friendly mood."
    ),
}


def generate(item):
    name, prompt = item
    body = json.dumps({
        "model": "gpt-image-2",
        "prompt": prompt,
        "n": 1,
        "size": "1536x1024",
        "quality": "medium",
    }).encode()
    req = urllib.request.Request(
        "https://api.openai.com/v1/images/generations",
        data=body,
        headers={
            "Authorization": f"Bearer {KEY}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            data = json.load(resp)
    except urllib.error.HTTPError as e:
        return name, f"HTTP {e.code}: {e.read().decode()[:500]}"
    d = data["data"][0]
    if d.get("b64_json"):
        raw = base64.b64decode(d["b64_json"])
    else:
        with urllib.request.urlopen(d["url"], timeout=120) as r:
            raw = r.read()
    path = OUT / f"{name}.png"
    path.write_bytes(raw)
    return name, f"saved {path} ({len(raw)} bytes)"


with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:
    for name, msg in ex.map(generate, PROMPTS.items()):
        print(f"{name}: {msg}")
