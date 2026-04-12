#!/usr/bin/env python3
"""Convert each TikTok post (folder of slide_*.jpg) into an MP4 slideshow (1080x1920, 9:16)."""
import os, subprocess, glob, shutil

BASE = "/sessions/clever-youthful-gates/mnt/Herzblatt Journal/tiktok/TikTok-Posts"
OUT = "/sessions/clever-youthful-gates/mnt/Herzblatt Journal/tiktok/Videos"
TMP = "/tmp/ttvid"
os.makedirs(OUT, exist_ok=True)
os.makedirs(TMP, exist_ok=True)

SECONDS_PER_SLIDE = 3

for post_folder in sorted(os.listdir(BASE)):
    p = os.path.join(BASE, post_folder)
    if not os.path.isdir(p):
        continue
    slides = sorted(glob.glob(os.path.join(p, "slide_*.jpg")))
    if not slides:
        continue
    # write concat list
    listfile = os.path.join(TMP, f"{post_folder}.txt")
    with open(listfile, "w") as f:
        for s in slides:
            f.write(f"file '{s}'\n")
            f.write(f"duration {SECONDS_PER_SLIDE}\n")
        # repeat last frame
        f.write(f"file '{slides[-1]}'\n")
    out = os.path.join(OUT, f"{post_folder}.mp4")
    # Scale/pad to 1080x1920 (9:16) with black padding, ensure even dims, yuv420p
    vf = "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0x1a0a20,format=yuv420p"
    cmd = [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-f", "concat", "-safe", "0", "-i", listfile,
        "-vf", vf,
        "-r", "30",
        "-c:v", "libx264", "-preset", "medium", "-crf", "20",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        out,
    ]
    subprocess.run(cmd, check=True)
    print(f"{post_folder}.mp4  ({len(slides)} slides)")

print("DONE")
