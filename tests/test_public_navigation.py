from html.parser import HTMLParser
from pathlib import Path


WEB_DIR = Path(__file__).resolve().parents[1] / "web"
PUBLIC_PAGES = [
    "ai-deception-experiment.html",
    "ai-deception-rankings.html",
    "ai-lies-to-protect-you.html",
    "ai-personality-by-country.html",
    "ai-safety-scorecard.html",
    "ai-self-preservation.html",
    "big-five-ai.html",
    "blog.html",
    "chatgpt-psychosis.html",
    "dark-ai-infrastructure.html",
    "dark-triad-ai.html",
    "guides.html",
    "home-robots-personality.html",
    "home.html",
    "is-ai-personality-real.html",
    "is-chatgpt-a-psychopath.html",
    "mbti-ai.html",
    "rankings.html",
    "uncensored-ai-models.html",
    "which-ai-lies-most.html",
    "why-ai-sounds-the-same.html",
]
EXPECTED_MENU = [
    ("Home", "/"),
    ("Dark Triad", "/rankings#dark-triad"),
    ("Big Five", "/rankings#big-five"),
    ("Jungian Type", "/rankings#type"),
    ("Deception", "/ai-deception-rankings"),
    ("Guides", "/guides"),
    ("Blog", "/blog"),
    ("About", "/rankings#about"),
    ("Make your own", "/"),
]


class TopMenuParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_menu = False
        self.current_href = None
        self.current_text = []
        self.items = []

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        classes = set(attributes.get("class", "").split())
        if tag == "nav" and ({"mast-nav", "rk-nav"} & classes):
            self.in_menu = True
        elif self.in_menu and tag == "a":
            self.current_href = attributes.get("href")
            self.current_text = []

    def handle_data(self, data):
        if self.current_href is not None:
            self.current_text.append(data)

    def handle_endtag(self, tag):
        if self.in_menu and tag == "a" and self.current_href is not None:
            self.items.append(("".join(self.current_text).strip(), self.current_href))
            self.current_href = None
            self.current_text = []
        elif tag == "nav" and self.in_menu:
            self.in_menu = False


def test_public_top_menus_are_consistent():
    for page_name in PUBLIC_PAGES:
        parser = TopMenuParser()
        parser.feed((WEB_DIR / page_name).read_text())
        expected = EXPECTED_MENU
        if page_name == "rankings.html":
            expected = [
                (label, href.removeprefix("/rankings"))
                if href.startswith("/rankings#")
                else (label, href)
                for label, href in EXPECTED_MENU
            ]
        assert parser.items == expected, page_name