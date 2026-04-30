# Avatar source images — k-2

Pollis renders the source illustration for this persona using **Nano Banana Pro**
(Gemini 3 Pro Image). The approved render goes here.

**Naming:** `<character>-v1.png`, e.g. `buddy-v1.png`, `max-v1.png`,
`nova-v1.png`, `ace-v1.png`, `morgan-v1.png`. Bump the version when
iterating (`-v2.png`, etc.) — keep prior versions in this directory for
reference.

**Format:** PNG, square (1:1), 1024×1024 minimum, front-facing portrait,
mouth closed neutral, eyes open and engaged.

**Upload to Simli:** After the image is approved, upload via the Simli
dashboard, copy the resulting `faceId`, and put it in Railway dev env as
`SIMLI_FACE_ID_K_2` (and the
matching `VITE_SIMLI_FACE_ID_*`). Then flip
`AVATAR_ENABLED_K_2="true"`.

See the companion file `avatar-image-prompts-nano-banana-pro.md.v1` for the
exact prompts.
