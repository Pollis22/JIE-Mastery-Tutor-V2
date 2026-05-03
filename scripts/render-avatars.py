#!/usr/bin/env python3
"""
Render the 8 viseme PNGs (A-H) per persona via fal.ai's
fal-ai/wan/v2.7/edit endpoint, plus copy each base portrait to
viseme-I (silent rest state).

This is a standalone tooling script. It is NOT part of the runtime build.
Install dependencies with:  pip install -r requirements-scripts.txt

Usage:
    python scripts/render-avatars.py                  # default: Morgan only
    python scripts/render-avatars.py --persona college
    python scripts/render-avatars.py --all
    python scripts/render-avatars.py --persona college --force

Requires:
    FAL_KEY environment variable

The script is idempotent: existing target PNGs are skipped unless --force is
passed. A hard cost cap of $5.00 aborts the run if exceeded.

Endpoint notes:
    Previously this script targeted `fal-ai/wan/v2.7/image-to-image`, which
    fal.ai retired ("Path /v2.7/image-to-image not found"). The current
    image-edit endpoint is `fal-ai/wan/v2.7/edit` ($0.03/image). Its accepted
    arguments are: prompt (str, required), image_urls (list[str], 1-4 URLs,
    required), image_size, num_images, enable_prompt_expansion, seed,
    enable_safety_checker, output_format. The legacy `image-to-image` knobs
    (strength, guidance_scale, num_inference_steps) are NOT supported here
    and are intentionally omitted from the request payload.

    `enable_prompt_expansion` is set to False so the model receives the exact
    viseme/mouth-shape prompts without LLM rewriting — character identity and
    precise mouth shapes matter more than richer scene descriptions.
"""

from __future__ import annotations

import argparse
import os
import shutil
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parent.parent
AVATARS_ROOT = REPO_ROOT / "client" / "src" / "assets" / "avatars"

FAL_MODEL = "fal-ai/wan/v2.7/edit"

# Per fal.ai docs: $0.03/image, hard fail at $5.00.
PER_RENDER_COST_USD = 0.03
COST_CAP_USD = 5.00

# Render parameters supported by fal-ai/wan/v2.7/edit.
# Note: strength / guidance_scale / num_inference_steps are not parameters of
# this endpoint and were removed when migrating from /image-to-image.
IMAGE_SIZE = {"width": 1024, "height": 1024}
NUM_IMAGES = 1
ENABLE_SAFETY_CHECKER = True
ENABLE_PROMPT_EXPANSION = False  # keep exact viseme prompts; do not let the model rewrite them
OUTPUT_FORMAT = "png"

MAX_RETRIES = 3
RETRY_BACKOFF_SECONDS = (1, 2, 4)


@dataclass(frozen=True)
class Persona:
    key: str            # CLI / persona name
    band: str           # grade-band folder
    folder: str         # persona folder name
    character: str      # <CHARACTER> substitution
    seed: int

    @property
    def dir(self) -> Path:
        return AVATARS_ROOT / self.band / self.folder

    @property
    def base_png(self) -> Path:
        return self.dir / f"{self.folder}-base.png"

    def viseme_path(self, letter: str) -> Path:
        return self.dir / f"{self.folder}-viseme-{letter}.png"


PERSONAS: dict[str, Persona] = {
    "k-2":     Persona("k-2",     "k-2",     "buddy",  "the cartoon bear character",         1001),
    "3-5":     Persona("3-5",     "3-5",     "max",    "the young child character",          1002),
    "6-8":     Persona("6-8",     "6-8",     "nova",   "the young scientist character",      1003),
    "9-12":    Persona("9-12",    "9-12",    "ace",    "the young adult mentor character",   1004),
    "college": Persona("college", "college", "morgan", "the college professor character",    1005),
}

# Friendly aliases so --persona buddy / max / nova / ace / morgan also work.
PERSONA_ALIASES = {p.folder: key for key, p in PERSONAS.items()}

# Section 5: viseme prompts. {character} is substituted per persona.
VISEME_PROMPTS: dict[str, str] = {
    "A": ('Same {character}, identical pose, hair, clothing, lighting, and background. '
          'Mouth wide open in an "ah" shape, jaw dropped, mouth forming a vertical oval. '
          'Neutral expression, not smiling.'),
    "B": ('Same {character}, identical pose, hair, clothing, lighting, and background. '
          'Mouth slightly open in an "eh" shape, jaw partially dropped, lips relaxed, '
          'small horizontal opening.'),
    "C": ('Same {character}, identical pose, hair, clothing, lighting, and background. '
          'Mouth round and small in an "oh" shape, lips pursed forward into a small circular O.'),
    "D": ('Same {character}, identical pose, hair, clothing, lighting, and background. '
          'Mouth tightly puckered in an "oo" shape, lips pushed forward, very rounded and small.'),
    "E": ('Same {character}, identical pose, hair, clothing, lighting, and background. '
          'Mouth firmly closed with lips pressed together, the "m b p" consonant shape, '
          'no opening visible.'),
    "F": ('Same {character}, identical pose, hair, clothing, lighting, and background. '
          'Mouth in the "f v" shape, top teeth lightly touching bottom lip, mouth slightly '
          'open showing the bite position.'),
    "G": ('Same {character}, identical pose, hair, clothing, lighting, and background. '
          'Mouth in the "th l" shape, slightly open with the tip of the tongue visible '
          'touching the upper teeth.'),
    "H": ('Same {character}, identical pose, hair, clothing, lighting, and background. '
          'Mouth in a wide horizontal smile shape, the "ee" sound, stretched sideways, '
          'showing a glimpse of teeth, friendly expression.'),
}

VISEME_LETTERS_RENDERED = list(VISEME_PROMPTS.keys())  # A-H


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def log(msg: str) -> None:
    print(msg, flush=True)


class CostCapExceeded(RuntimeError):
    pass


class HardFailure(RuntimeError):
    """Non-retryable error from fal.ai (e.g. auth, content filter on a non-viseme failure)."""


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Render JIE Mastery viseme PNGs via fal.ai.")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--all", action="store_true", help="Render all 5 personas.")
    group.add_argument(
        "--persona",
        type=str,
        help=(
            "Render only the named persona. Accepts grade-band keys "
            "(k-2, 3-5, 6-8, 9-12, college) or character names "
            "(buddy, max, nova, ace, morgan)."
        ),
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-render visemes even if the target PNG already exists.",
    )
    return parser.parse_args(argv)


def select_personas(args: argparse.Namespace) -> list[Persona]:
    if args.all:
        return list(PERSONAS.values())
    if args.persona:
        key = args.persona.strip().lower()
        if key in PERSONAS:
            return [PERSONAS[key]]
        if key in PERSONA_ALIASES:
            return [PERSONAS[PERSONA_ALIASES[key]]]
        raise SystemExit(
            f"Unknown persona '{args.persona}'. Valid: "
            f"{sorted(list(PERSONAS.keys()) + list(PERSONA_ALIASES.keys()))}"
        )
    # Default: Morgan only (Section 7 of the brief).
    return [PERSONAS["college"]]


def verify_fal_key() -> None:
    if not os.environ.get("FAL_KEY"):
        raise SystemExit(
            "ERROR: FAL_KEY environment variable is not set. "
            "Export FAL_KEY=<your-key> before running this script."
        )


def verify_base_portraits(personas: Iterable[Persona]) -> None:
    missing = [p for p in personas if not p.base_png.exists()]
    if missing:
        names = ", ".join(str(p.base_png.relative_to(REPO_ROOT)) for p in missing)
        raise SystemExit(f"ERROR: Missing base portrait(s): {names}")


def import_fal_client():
    try:
        import fal_client  # type: ignore
    except ImportError as exc:  # pragma: no cover
        raise SystemExit(
            "ERROR: fal-client is not installed. "
            "Run: pip install -r requirements-scripts.txt"
        ) from exc
    return fal_client


# ---------------------------------------------------------------------------
# Render core
# ---------------------------------------------------------------------------


def download_to(url: str, dst: Path) -> None:
    """Download a URL to dst. fal.ai output URLs are plain HTTPS; no auth needed."""
    import requests  # local import keeps top-level imports light

    resp = requests.get(url, timeout=120)
    resp.raise_for_status()
    dst.write_bytes(resp.content)


def render_one_viseme(
    fal_client,
    persona: Persona,
    letter: str,
    image_url: str,
    running_total: float,
) -> tuple[bool, float, str]:
    """
    Render a single viseme. Returns (success, cost, note).

    - On success: writes the PNG to disk, returns (True, cost, "").
    - On hard failure (auth / content filter): re-raises HardFailure for auth,
      returns (False, 0, reason) for content filter so the run can continue.
    - On retry exhaustion: returns (False, 0, last_error_string).
    """
    target = persona.viseme_path(letter)
    prompt = VISEME_PROMPTS[letter].format(character=persona.character)

    # fal-ai/wan/v2.7/edit takes `image_urls` (list of 1-4 URLs), `prompt`,
    # plus the optional knobs below. Legacy strength/guidance/inference_steps
    # are not part of this endpoint's schema and are intentionally omitted.
    arguments = {
        "prompt": prompt,
        "image_urls": [image_url],
        "image_size": IMAGE_SIZE,
        "num_images": NUM_IMAGES,
        "enable_safety_checker": ENABLE_SAFETY_CHECKER,
        "enable_prompt_expansion": ENABLE_PROMPT_EXPANSION,
        "output_format": OUTPUT_FORMAT,
        "seed": persona.seed,
    }

    last_error: str = ""
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            result = fal_client.subscribe(FAL_MODEL, arguments=arguments)
        except Exception as exc:  # noqa: BLE001 - fal SDK raises various types
            text = str(exc)
            lowered = text.lower()
            # Auth failure: do not retry, abort persona via HardFailure.
            if any(s in lowered for s in ("401", "403", "unauthorized", "forbidden", "invalid api key")):
                raise HardFailure(f"fal.ai auth error: {text}") from exc
            # Content filter rejection (per brief Section 9): log + skip viseme.
            if any(s in lowered for s in ("422", "content filter", "safety", "rejected")):
                note = f"content-filter rejection: {text}"
                log(f"  ! {persona.folder} viseme {letter} — {note}")
                log(f"     prompt was: {prompt}")
                return (False, 0.0, note)
            last_error = text
            if attempt < MAX_RETRIES:
                backoff = RETRY_BACKOFF_SECONDS[attempt - 1]
                log(f"  ... {persona.folder} viseme {letter} attempt {attempt} failed "
                    f"({text}); retrying in {backoff}s")
                time.sleep(backoff)
                continue
            log(f"  ! {persona.folder} viseme {letter} — failed after {MAX_RETRIES} "
                f"attempts: {text}")
            return (False, 0.0, last_error)

        # Successful subscribe — extract the output image URL.
        try:
            images = result.get("images") if isinstance(result, dict) else None
            if not images:
                raise ValueError(f"no 'images' in response: {result!r}")
            out_url = images[0]["url"] if isinstance(images[0], dict) else images[0]
            if not out_url:
                raise ValueError(f"empty image url in response: {result!r}")
        except Exception as exc:  # noqa: BLE001
            last_error = f"malformed fal response: {exc}"
            if attempt < MAX_RETRIES:
                backoff = RETRY_BACKOFF_SECONDS[attempt - 1]
                log(f"  ... {persona.folder} viseme {letter} attempt {attempt} bad response "
                    f"({last_error}); retrying in {backoff}s")
                time.sleep(backoff)
                continue
            log(f"  ! {persona.folder} viseme {letter} — bad response after "
                f"{MAX_RETRIES} attempts: {last_error}")
            return (False, 0.0, last_error)

        # Save the returned PNG unchanged (no post-processing per brief Section 3).
        try:
            download_to(out_url, target)
        except Exception as exc:  # noqa: BLE001
            last_error = f"download failed: {exc}"
            if attempt < MAX_RETRIES:
                backoff = RETRY_BACKOFF_SECONDS[attempt - 1]
                log(f"  ... {persona.folder} viseme {letter} download attempt {attempt} "
                    f"failed ({exc}); retrying in {backoff}s")
                time.sleep(backoff)
                continue
            log(f"  ! {persona.folder} viseme {letter} — download failed after "
                f"{MAX_RETRIES} attempts: {exc}")
            return (False, 0.0, last_error)

        cost = PER_RENDER_COST_USD
        new_total = running_total + cost
        log(f"  ✓ {persona.folder} viseme {letter} rendered "
            f"(cost: ${cost:.2f}, total: ${new_total:.2f})")
        return (True, cost, "")

    # Defensive — loop exits via return/raise above.
    return (False, 0.0, last_error or "unknown error")


def render_persona(
    fal_client,
    persona: Persona,
    force: bool,
    running_total: float,
) -> tuple[float, list[str]]:
    """Render all 8 viseme images for a persona plus the viseme-I copy.

    Returns the new running total and the list of failure notes.
    """
    log(f"\n=== Persona {persona.folder} ({persona.band}) — seed {persona.seed} ===")
    persona.dir.mkdir(parents=True, exist_ok=True)

    if not persona.base_png.exists():
        raise HardFailure(f"base portrait missing: {persona.base_png}")

    # Step d: silent rest viseme is a copy of the base portrait.
    viseme_i = persona.viseme_path("I")
    if viseme_i.exists() and not force:
        log(f"  · viseme I already present, skipping copy ({viseme_i.name})")
    else:
        shutil.copyfile(persona.base_png, viseme_i)
        log(f"  ✓ viseme I copied from base ({viseme_i.name})")

    # Step c: upload base portrait once per persona.
    log(f"  · uploading base portrait to fal.storage ({persona.base_png.name})")
    try:
        image_url = fal_client.upload_file(str(persona.base_png))
    except Exception as exc:  # noqa: BLE001
        raise HardFailure(f"failed to upload base portrait: {exc}") from exc
    log(f"  · uploaded -> {image_url}")

    persona_cost = 0.0
    failures: list[str] = []
    for letter in VISEME_LETTERS_RENDERED:
        target = persona.viseme_path(letter)
        if target.exists() and not force:
            log(f"  · viseme {letter} already present, skipping ({target.name})")
            continue

        # Cost cap check before each render so we never exceed.
        if running_total + PER_RENDER_COST_USD > COST_CAP_USD:
            raise CostCapExceeded(
                f"cost cap ${COST_CAP_USD:.2f} would be exceeded "
                f"(running ${running_total:.2f} + ${PER_RENDER_COST_USD:.2f})"
            )

        ok, cost, note = render_one_viseme(
            fal_client, persona, letter, image_url, running_total
        )
        if ok:
            running_total += cost
            persona_cost += cost
        else:
            failures.append(f"{persona.folder} viseme {letter}: {note}")

    log(f"  Persona {persona.folder} complete: cost ${persona_cost:.2f}, "
        f"failures: {len(failures)}")
    return running_total, failures


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv if argv is not None else sys.argv[1:])
    verify_fal_key()
    personas = select_personas(args)
    verify_base_portraits(personas)

    fal_client = import_fal_client()

    running_total = 0.0
    all_failures: list[str] = []
    aborted = False

    for persona in personas:
        try:
            running_total, failures = render_persona(
                fal_client, persona, args.force, running_total
            )
            all_failures.extend(failures)
        except CostCapExceeded as exc:
            log(f"\nABORT: {exc}")
            aborted = True
            break
        except HardFailure as exc:
            log(f"\nABORT (hard failure on {persona.folder}): {exc}")
            aborted = True
            break

    log("\n--- Summary ---")
    log(f"Personas processed: {[p.folder for p in personas]}")
    log(f"Grand total cost:   ${running_total:.2f}")
    if all_failures:
        log(f"Failures ({len(all_failures)}):")
        for f in all_failures:
            log(f"  - {f}")
    if aborted:
        return 2
    if all_failures:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
