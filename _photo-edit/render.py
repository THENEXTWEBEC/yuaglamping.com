#!/usr/bin/env python3
"""Export YUA photo variants from the untouched backup (requires Pillow and NumPy).

From the website root: python3 _photo-edit/render.py
Add --proof /path/to/folder to generate side-by-side proofs and tone measurements.
"""

import argparse
import io
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageCms, ImageDraw, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parents[1]
RECIPES = Path(__file__).with_name('recipes.json')
LUMA = np.array([.2126, .7152, .0722], dtype=np.float32)


def read_photo(path):
    with Image.open(path) as source:
        photo = ImageOps.exif_transpose(source).convert('RGB')
        profile = source.info.get('icc_profile')
        if profile:
            photo = ImageCms.profileToProfile(
                photo, ImageCms.getOpenProfile(io.BytesIO(profile)), ImageCms.createProfile('sRGB')
            )
    return photo


def retouch(photo, recipe):
    rgb = np.asarray(photo, dtype=np.float32) / 255
    luminance = rgb @ LUMA
    if recipe.get('denoise'):
        blurred = np.asarray(photo.filter(ImageFilter.GaussianBlur(.65)), dtype=np.float32) / 255
        difference = blurred - rgb
        weight = np.maximum(0, 1 - luminance / .5) * recipe['denoise']
        rgb += np.clip(difference, -.035, .035) * weight[..., None]
        luminance = rgb @ LUMA

    # Lift supported shadows and midtones while anchoring black and rolling off highlights.
    shadow_mask = np.sqrt(luminance) * (1 - luminance) ** 3
    midtone_mask = np.sin(np.pi * luminance) ** 2 * (1 - luminance)
    corrected = luminance + recipe['shadows'] * shadow_mask + recipe['midtones'] * midtone_mask
    contrast = recipe.get('contrast', .015)
    corrected += contrast * (luminance - .40) * np.sin(np.pi * luminance) ** 2
    corrected = np.clip(corrected, 0, 1)

    # Keep hue stable as exposure changes, then roll chroma into the available gamut.
    chroma = rgb - luminance[..., None]
    chroma *= (recipe.get('saturation', 1) + .13 * (corrected - luminance))[..., None]
    balance = np.array(recipe.get('balance', [0, 0, 0]), dtype=np.float32)
    balance -= balance @ LUMA
    chroma += np.sin(np.pi * luminance)[..., None] * balance
    base = corrected[..., None]
    positive = np.maximum(chroma.max(axis=-1, keepdims=True), 1e-6)
    negative = np.maximum(-chroma.min(axis=-1, keepdims=True), 1e-6)
    gamut = np.minimum(1, np.minimum((1 - base) / positive, base / negative))
    return Image.fromarray(np.round((base + chroma * gamut) * 255).astype('uint8'))


def variants(photo, relative, output):
    width, height = photo.size
    full = min(width, round(2200 * width / height), 1800)
    widths = sorted({min(full, 480), min(full, 900), full})
    if len(widths) == 3 and full - widths[-2] < 160:
        widths.remove(widths[-2])
    if len(widths) == 2 and full - widths[0] < 120:
        widths = [full]

    for width in widths:
        rendered = photo.resize((width, round(height * width / photo.width)), Image.Resampling.LANCZOS)
        rendered = rendered.filter(ImageFilter.UnsharpMask(radius=.65, percent=30, threshold=4))
        dest = output / relative.parent / f'{relative.stem}-{width}.webp'
        dest.parent.mkdir(parents=True, exist_ok=True)
        rendered.save(dest, 'WEBP', quality=85 if width == full else 82, method=6)
    return widths


def proof(before, after, path, caption):
    sheet = Image.new('RGB', (820, 445), '#f2f0e9')
    draw = ImageDraw.Draw(sheet)
    for x, photo, label in ((0, before, 'Original'), (410, after, 'Corregida')):
        photo = ImageOps.contain(photo, (390, 395))
        sheet.paste(photo, (x + (410 - photo.width) // 2, (400 - photo.height) // 2))
        draw.text((x + 12, 400), label, fill='black')
    draw.text((12, 422), caption, fill='black')
    sheet.save(path, quality=90)


def measure(photo):
    values = (np.asarray(photo, dtype=np.float32) / 255) @ LUMA
    return [round(float(value), 3) for value in np.percentile(values, [10, 50, 90, 99])]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--proof', type=Path)
    args = parser.parse_args()
    if args.proof:
        args.proof.mkdir(parents=True, exist_ok=True)
    inventory = {}
    for index, (name, recipe) in enumerate(json.loads(RECIPES.read_text()).items()):
        relative = Path(name)
        original = read_photo(ROOT / '_photo-originals' / relative)
        corrected = retouch(original, recipe)
        widths = variants(corrected, relative, ROOT)
        inventory[name] = {'widths': widths, 'height': original.height, 'width': original.width}
        if args.proof:
            proof(original, corrected, args.proof / f'{index:02}.jpg', name)
            print(f'{index:02} {name}: {measure(original)} -> {measure(corrected)}')
    if args.proof:
        (args.proof / 'variants.json').write_text(json.dumps(inventory, indent=2) + '\n')


if __name__ == '__main__':
    main()
