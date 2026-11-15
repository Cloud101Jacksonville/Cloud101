"""Build js/menu-data.js from the scraped Cloud 101 catalog.

Usage: python3 tools/build_menu_data.py <raw_products.json> js/menu-data.js

raw_products.json maps page slugs (e.g. "shop_vape-products_vapes") to the
product objects embedded in each category page of cloud101smokeandvape.com.

Product photos saved under assets/products/<sha1(url)[:12]>.webp are used
instead of the remote Saucey CDN URL whenever the local file exists.
"""
import hashlib
import json
import os
import re
import sys

CATEGORIES = [
    {
        "slug": "vape-products", "name": "Vape Products",
        "tagline": "Vapes, pods, hookah vapes & hardware",
        "intro": "Every vape we carry — disposable vapes, refillable pods, hookah-style vapes and full vape hardware — all in one place. Stocked fresh at our University Blvd shop, open daily until 2 AM.",
        "subs": [
            ["vapes", "Vapes", "Vapes", "A deep selection of vapes in every flavor and puff count, from compact pocket devices to high-puff powerhouses."],
            ["vape-pods", "Vape Pods", "Vape Pods", "Replacement pods and pod systems from the biggest names in vaping. Walk-in stock at our University Blvd location."],
            ["hookah-vapes", "Hookah Vapes", "Hookah Vapes", "Hookah-style vapes and flavored hookah disposables — the easy way to enjoy hookah anywhere."],
            ["vape-hardware", "Vape Hardware", "Vape Hardware", "Mods, tanks, batteries, chargers and replacement coils. Build your perfect setup with help from our team."],
        ],
    },
    {
        "slug": "hemp-products", "name": "Hemp Products",
        "tagline": "Delta, flower, edibles & hemp drinks",
        "intro": "The full hemp lineup — delta and THCA disposables, premium flower, prerolls, edibles and ready-to-drink hemp beverages. Federally compliant and available in-store until 2 AM.",
        "subs": [
            ["delta", "Delta", "Delta", "Delta and THCA disposables, gummies and concentrates from trusted hemp brands."],
            ["flower", "Flower", "Flower", "Premium hemp flower and THCA flower by the gram, eighth and more — fresh and fragrant."],
            ["prerolls", "PreRolls", "PreRolls", "Hemp and THCA prerolls ready to enjoy — singles, multi-packs and infused options."],
            ["edibles", "Edibles", "Edibles", "Hemp and THCA gummies, chocolates and chews from leading brands — discreet and dosed."],
            ["hemp-drink", "Hemp Drink", "Hemp Drink", "Ready-to-drink hemp and THCA beverages — sparkling, seltzer-style and more. Kept chilled."],
        ],
    },
    {
        "slug": "smoking-essentials", "name": "Smoking Essentials",
        "tagline": "Cigarillos, wraps, papers & accessories",
        "intro": "Everything you need for the perfect session — cigarillos, wraps, rolling papers, smoke accessories, lighters and air fresheners. One stop.",
        "subs": [
            ["cigarillos", "Cigarillos", "Cigarillos", "Cigarillos by the pack and single in classic and flavored profiles, from the brands customers ask for most."],
            ["wraps", "Wraps", "Wraps", "Tobacco, hemp and flavored wraps in every common size, from the brands you ask for most."],
            ["rolling-papers", "Rolling Papers", "Rolling Papers", "King size, 1¼, hemp, organic and flavored rolling papers from leading brands."],
            ["smoke-accessories", "Smoke Accesories", "Smoke Accessories", "Pipes, grinders, ashtrays, cleaning supplies and storage."],
            ["lighters", "Lighters", "Lighters", "Disposable, refillable and torch lighters from the top brands."],
            ["air-freshener", "Air Freshener ", "Air Freshener", "Sprays, candles and odor-neutralizers to keep your space fresh."],
        ],
    },
    {
        "slug": "convenience", "name": "Convenience",
        "tagline": "Beverages and snacks",
        "intro": "Cold beverages and late-night snacks — grab them at the counter with everything else. Open daily until 2 AM.",
        "subs": [
            ["beverage", "Beverage", "Beverage", "Sodas, energy drinks, juices, detox drinks and waters."],
            ["snacks", "Snacks", "Snacks", "Chips, sweets and late-night munchies."],
        ],
    },
    {
        "slug": "kratom", "name": "Kratom",
        "tagline": "Powders, capsules & extracts",
        "intro": "Kratom by strain and format — powders, capsules, liquid shots and concentrated extracts — from reputable brands you know. Walk in any day until 2 AM.",
        "subs": [],
    },
    {
        "slug": "nicotine-pouches", "name": "Nicotine Pouches",
        "tagline": "Smokeless nicotine pouches",
        "intro": "Smokeless nicotine pouches from the top brands — mint, citrus, berry, coffee and high-strength options. Discreet, smoke-free and easy to enjoy anywhere.",
        "subs": [],
    },
    {
        "slug": "novelty", "name": "Novelty",
        "tagline": "Lifestyle and novelty products",
        "intro": "Novelty items, gift-ready pieces and rotating finds. Stop in to see what's on the shelf right now.",
        "subs": [],
    },
]

LOCAL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "products")

IMG_PREFIXES = {
    "l": "assets/products/",
    "m": "https://cdn.saucey.com/direct/web/merchant-assets/698394e7cc9c43d23fcc35db/products/",
    "p": "https://cdn.saucey.com/production/products/",
}


def clean(s):
    return re.sub(r"\s+", " ", (s or "")).strip()


def short_img(url):
    if not url:
        return ""
    local = hashlib.sha1(url.encode()).hexdigest()[:12] + ".webp"
    if os.path.exists(os.path.join(LOCAL_DIR, local)):
        return "l:" + local
    for k, pre in IMG_PREFIXES.items():
        if url.startswith(pre):
            return k + ":" + url[len(pre):]
    return url


def puffs(name):
    m = re.search(r"(\d{1,3}(?:[.,]\d)?)\s*[kK]\b", name)
    if m:
        return f"{int(float(m.group(1).replace(',', '.')) * 1000):,}"
    m = re.search(r"\b(\d{4,6})\b", name)
    if m and int(m.group(1)) >= 1000:
        return f"{int(m.group(1)):,}"
    return None


def count_label(size, unit_one, unit_many):
    s = clean(size)
    if re.fullmatch(r"\d+", s):
        n = int(s)
        return f"{n} {unit_one if n == 1 else unit_many}"
    return s


def describe(p, sub):
    """Short, honest menu blurb built only from the product's own name/brand/size."""
    name, brand, size = clean(p["name"]), clean(p["brand"]), clean(p["size"])
    low = name.lower()
    # Only mention the brand when the product name doesn't already contain it.
    bwords = [w for w in re.split(r"[^a-z0-9]+", brand.lower()) if len(w) > 2]
    named = not bwords or any(w in low for w in bwords)
    frm = "" if named else f" from {brand}"
    by = "" if named else f" by {brand}"
    pf = puffs(name)
    num = bool(re.fullmatch(r"\d+", size))
    if sub == "vapes":
        kind = "refill pod" if " pod" in low else "starter kit" if " kit" in low else "disposable vape"
        s = f"A {kind}{frm}" + (f", rated for up to {pf} puffs." if pf else ".")
        if size and not num:
            s += f" Holds {size} of e-liquid."
        return s + " Ask our team which flavors and nicotine strengths are on the shelf."
    if sub == "vape-pods":
        return f"Replacement pod{frm}" + (f", rated for up to {pf} puffs." if pf else ".") + " Make sure it matches your device — our staff can help you pick the right one."
    if sub == "hookah-vapes":
        return f"Hookah-style disposable{frm}" + (f" built for up to {pf} puffs" if pf else "") + ". Big shisha-inspired flavor with no coals and no setup."
    if sub == "vape-hardware":
        return f"Vape hardware{frm}. Our team can help you get it set up in-store."
    if sub == "delta":
        kind = ("gummies" if "gumm" in low else "pre-roll" if re.search(r"pre.?roll", low)
                else "cartridge" if "cart" in low else "disposable" if size.lower().endswith("ml") or "disposable" in low else "product")
        return f"Hemp-derived {kind}{frm}" + (f" ({size})" if size and not num else "") + ". 21+ only. Effects vary — start low and go slow."
    if sub == "flower":
        return f"Hemp flower{frm}" + (f", packed in {size}." if size.endswith("g") else ".") + " 21+ only."
    if sub == "prerolls":
        return f"Ready-to-enjoy hemp preroll{frm}" + (f", {size} per pack." if num and size != "1" else ".") + " 21+ only."
    if sub == "edibles":
        return f"Hemp-derived edible{frm}. Edibles can take 30–90 minutes to kick in, so start low and go slow. 21+ only."
    if sub == "hemp-drink":
        return f"Ready-to-drink hemp beverage{frm}" + (f" ({size})" if size and not num else "") + ". Best served cold. 21+ only."
    if sub == "cigarillos":
        return f"Cigarillos{by}" + (f" — {size} per pack." if num and size != "1" else " — sold as a single." if size == "1" else ".")
    if sub == "wraps":
        n = size.replace(" count", "")
        return f"Wraps{by}" + (f" — {n} per pack." if re.fullmatch(r"\d+", n) and n != "1" else " — sold as a single." if n == "1" else ".")
    if sub == "rolling-papers":
        return f"Rolling papers & cones{by}" + (f" — {size} per pack." if num and size != "1" else ".") + " A shop staple for a smooth, even roll."
    if sub == "smoke-accessories":
        return f"Smoke accessory{frm}" + (f" — {size} per pack." if num and size != "1" else ".") + " Everything else you need for the session."
    if sub == "lighters":
        return f"Lighter{frm}. Reliable flame, every time."
    if sub == "air-freshener":
        return f"Odor eliminator{frm}" + (f" ({size})" if size else "") + ". Keeps your space smelling fresh."
    if sub == "beverage":
        return f"Cold drink{frm}" + (f" — {size}" if size and not num else "") + ". Grab it from the cooler."
    if sub == "snacks":
        return f"Sweet treat{frm}. The perfect late-night pick-me-up."
    if sub == "kratom":
        kind = ("capsules" if "capsule" in low else "powder" if "powder" in low else "drink" if "drink" in low or "mit" in low and size == "12oz"
                else "liquid shot" if "shot" in low or "fl oz" in size else "extract" if "ml" in size else "product")
        qty = f" — {size} count" if kind == "capsules" and num else f" ({size})" if size and not num else f", {size}-pack" if num and size != "1" else ""
        return f"Kratom {kind}{frm}{qty}. 21+ only. Use responsibly."
    if sub == "nicotine-pouches":
        return f"Tobacco-free nicotine pouches{frm}" + (f", {size.lower()} per can." if size else ".") + " Smoke-free and spit-free."
    if sub == "novelty":
        return f"Novelty item{frm}. Stop in to see what's on the shelf right now."
    return f"{name}{frm}."


def main(src, dst):
    raw = json.load(open(src))
    out_cats, products = [], []
    for c in CATEGORIES:
        subs = c["subs"]
        if subs:
            pages = [(f"shop_{c['slug']}_{s[0]}", s[0], s[1]) for s in subs]
        else:
            pages = [(f"shop_{c['slug']}", None, None)]
        groups = {}
        order = []
        for page, sub, src_label in pages:
            for p in raw[page]:
                if src_label is not None:
                    assert p["category"] == src_label, (page, p["category"])
                name, brand = clean(p["name"]), clean(p["brand"])
                size = clean(p["size"])
                key = (name.lower(), brand.lower(), size.lower(), p["price"], p.get("salePrice"), sub)
                desc = clean_desc(p.get("description"))
                variant = {"i": short_img(p.get("image")), "d": desc}
                if key not in groups:
                    groups[key] = {
                        "n": name, "b": brand, "c": c["slug"], "s": sub or "", "z": size,
                        "p": p["price"], **({"sp": p["salePrice"]} if p.get("salePrice") else {}),
                        "g": describe(p, sub or c["slug"]), "v": [],
                    }
                    order.append(key)
                groups[key]["v"].append(variant)
        for k in order:
            g = groups[k]
            # Drop empty variant fields to keep the file small.
            g["v"] = [{kk: vv for kk, vv in v.items() if vv} for v in g["v"]]
            products.append(g)
        out_cats.append({
            "slug": c["slug"], "name": c["name"], "tagline": c["tagline"], "intro": c["intro"],
            "subs": [{"slug": s[0], "name": s[2], "intro": s[3]} for s in subs],
        })
    for i, p in enumerate(products):
        p["id"] = i + 1
    total_items = sum(len(p["v"]) for p in products)
    data = {"imgPrefixes": IMG_PREFIXES, "categories": out_cats, "products": products, "itemCount": total_items}
    with open(dst, "w") as f:
        f.write("/* Cloud 101 menu data — generated by tools/build_menu_data.py. */\n")
        f.write("window.CLOUD101_MENU = ")
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    print(f"{len(products)} menu cards, {total_items} items")


def clean_desc(d):
    if not d:
        return ""
    d = d.replace("\r", "").strip()
    return re.sub(r"\n{3,}", "\n\n", d)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
