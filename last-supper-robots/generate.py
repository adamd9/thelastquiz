import base64
import concurrent.futures
import json
import os
import pathlib
import urllib.request

KEY = os.environ["SKILL_IMAGE_GEN_OPENAI_KEY"]
OUT = pathlib.Path(__file__).parent

PROMPTS = {
    "variant1_pixar3d": (
        "Cute 3D cartoon illustration in Pixar/animated-movie style: 'The Last Supper' "
        "reimagined with rounded, friendly robots seated at a long wooden dinner table. "
        "The central robot has a glowing golden halo floating above its head, clearly the "
        "good leader, calm and kind. One robot off-center leans in with menacing glowing "
        "RED eyes, a sly smirk, and a subtle dark aura, clearly the villain but comically so. "
        "The other robots are quirky and expressive, reacting with surprise, gasps, and "
        "confusion. Warm candlelit dinner lighting, soft shadows, vibrant colors, wholesome "
        "and funny tone, wide cinematic composition."
    ),
    "variant2_flatvector": (
        "Flat vector cartoon illustration, modern storybook style with bold outlines and "
        "bright flat colors: 'The Last Supper' parody featuring a row of boxy retro robots "
        "at a long table. The good robot in the center glows with a bright yellow halo ring "
        "above its antenna. To its side, one clearly evil robot has burning red LED eyes, a "
        "jagged grin, and tiny dark lightning bolts around it. Remaining robots have varied "
        "fun designs, spring arms, satellite dishes, mismatched bolts, all reacting "
        "dramatically. Clean minimal background, lighthearted and playful, humorous mood."
    ),
    "variant3_painterly": (
        "Painterly cartoon illustration with a comic / graphic-novel feel: a dramatic "
        "reinterpretation of 'The Last Supper' with a diverse crew of robots gathered at a "
        "long banquet table. A serene central robot bears a shining golden halo, hands raised "
        "gently. Nearby, the traitor robot glares with sinister red glowing eyes and a smug "
        "metallic grin, clutching a suspicious oil can behind its back. Other robots, rusty, "
        "sleek, tiny, giant, react with exaggerated shock and laughter. Rich warm lighting, "
        "textured brushstrokes, expressive faces, comedic and lighthearted despite the "
        "'betrayal' theme."
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
