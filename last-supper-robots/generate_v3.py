import base64
import concurrent.futures
import json
import os
import pathlib
import urllib.request

KEY = os.environ["SKILL_IMAGE_GEN_OPENAI_KEY"]
OUT = pathlib.Path(__file__).parent

BASE = (
    "Whimsical painted cartoon illustration, cozy children's-book aesthetic with soft "
    "painterly textures and big rounded shapes: a fun parody of 'The Last Supper' featuring "
    "a long dinner table with cute, colorful cartoon robots all seated together in a row "
    "behind the table, enjoying a feast. The good robot sits in the center and glows with a "
    "happy golden halo, sparkling and kind. One little rascal robot is ALSO seated at the "
    "table among the others (not standing apart), with bright cartoonish red glowing eyes and "
    "a silly sneaky smirk, clearly the 'naughty' one but adorable and completely harmless. "
    "The surrounding robots are quirky, pastel-colored, and expressive, waving, cheering, and "
    "reacting with delight. Soft warm candlelight, pastel palette, playful and heartwarming, "
    "absolutely not scary."
)

PROMPTS = {
    "v3_b_seated_a": BASE + " Everyone including the naughty robot is clearly sitting at the same table.",
    "v3_b_seated_b": BASE + " The mischievous red-eyed robot is seated a few chairs down the table, mid-row, blending in with the group.",
    "v3_b_seated_c": BASE + " The naughty red-eyed robot sits right beside the haloed good robot at the table, leaning in with a cheeky grin.",
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
