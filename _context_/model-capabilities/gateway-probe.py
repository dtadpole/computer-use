#!/usr/bin/env python3
"""Re-run the [cu] gateway capability probes (see INDEX.md beside this file).

Usage: python3 gateway-probe.py GROUP [--models m1,m2]
GROUP: versions | roundtrip | limits | gpt
The Conclave key is read from ~/.heddle/keys/conclave.api.key at run time (D-007): never printed, logged or stored.
Raw records go to /tmp/cu-gateway-probe/ (image data and credentials redacted). Standard library only.
Each call times out after 60 s and a group makes 3 to 24 calls, so run a group in the background (a managed
background job, or `... > /tmp/cu-gateway-probe.log 2>&1 &`) and read the log in short checks; a single small group
with --models naming one model usually ends within a minute.
"""
import argparse, base64, json, os, struct, sys, time, urllib.error, urllib.request, zlib

BASE = "http://127.0.0.1:8088"
KEY_FILE = os.path.expanduser("~/.heddle/keys/conclave.api.key")
OUT = "/tmp/cu-gateway-probe"
CLAUDE = ["model-a", "claude-sonnet-5-5", "claude-opus-5", "claude-sonnet-5", "claude-opus-4-8",
          "claude-opus-4-7", "claude-sonnet-4-6", "claude-sonnet-4-5"]
GPT = ["gpt-6.1-sol", "gpt-5.6-sol", "gpt-6-luna", "gpt-5.6-luna", "gpt-5.5"]
TOOLSET = {"type": "computer_toolset_20260801"}


def call(name, path, body, headers=None, bearer=False):
    with open(KEY_FILE) as f:
        key = f.read().strip()
    h = {"content-type": "application/json"}
    h.update({"authorization": "Bearer " + key} if bearer else {"x-api-key": key, "anthropic-version": "2023-06-01"})
    h.update(headers or {})
    data = json.dumps(body).encode()
    t0 = time.time()
    try:
        with urllib.request.urlopen(urllib.request.Request(BASE + path, data=data, headers=h), timeout=60) as r:
            status, raw = r.status, r.read()
    except urllib.error.HTTPError as e:
        status, raw = e.code, e.read()
    try:
        resp = json.loads(raw)
    except ValueError:
        resp = raw.decode(errors="replace")[:2000]
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, name + ".json"), "w") as f:
        json.dump({"name": name, "status": status, "seconds": round(time.time() - t0, 2), "response": resp}, f, indent=1)
    return status, resp


def line(name, status, resp):
    s = "%-45s HTTP %s" % (name, status)
    if isinstance(resp, dict):
        if "error" in resp:
            s += " error: " + str(resp["error"].get("message", resp["error"]))[:220]
        for b in resp.get("content", []):
            if b.get("type") == "text":
                s += " | text: " + b["text"][:100].replace("\n", " ")
            elif b.get("type") == "tool_use":
                s += " | tool_use %s/%s %s" % (b.get("toolset_name"), b["name"], json.dumps(b["input"]))
        if "usage" in resp and "input_tokens" in resp["usage"]:
            s += " | in=%s" % resp["usage"]["input_tokens"]
        if "choices" in resp:
            m = resp["choices"][0]["message"]
            s += " | %s tool_calls=%s" % (str(m.get("content"))[:100], json.dumps(m.get("tool_calls"))[:160])
    print(s, flush=True)
    return resp


# A tiny PNG writer and 5x7 font, so the probe needs no imaging library.
FONT = {c: g for c, g in zip("SUBMITCANEL", [
    "01111100001000001110000010000111110", "10001100011000110001100011000101110", "11110100011000111110100011000111110",
    "10001110111010110101100011000110001", "11111001000010000100001000010011111", "11111001000010000100001000010000100",
    "01111100001000010000100001000001111", "01110100011000111111100011000110001", "10001110011010110011100011000110001",
    "11111100001000011110100001000011111", "10000100001000010000100001000011111"])}


def page(w, h):
    """A fake form: SUBMIT (blue) and CANCEL (grey) buttons at known places. Returns (png_b64, centre, box)."""
    px = bytearray(b"\xff" * (w * h * 3))

    def rect(x0, y0, x1, y1, c):
        for y in range(max(0, y0), min(h, y1)):
            px[(y * w + max(0, x0)) * 3:(y * w + min(w, x1)) * 3] = bytes(c) * (min(w, x1) - max(0, x0))

    def text(x, y, s, k, c):
        for ch in s:
            for i, bit in enumerate(FONT[ch]):
                if bit == "1":
                    rect(x + (i % 5) * k, y + (i // 5) * k, x + (i % 5 + 1) * k, y + (i // 5 + 1) * k, c)
            x += 6 * k
    rect(0, 0, w, 60, (230, 230, 230))
    box = (int(w * 0.62), int(h * 0.72), int(w * 0.62) + 220, int(h * 0.72) + 70)
    rect(*box, (30, 90, 220))
    text(box[0] + 30, box[1] + 21, "SUBMIT", 4, (255, 255, 255))
    rect(int(w * 0.2), box[1], int(w * 0.2) + 220, box[3], (170, 170, 170))
    text(int(w * 0.2) + 30, box[1] + 21, "CANCEL", 4, (0, 0, 0))
    raw = b"".join(b"\x00" + bytes(px[y * w * 3:(y + 1) * w * 3]) for y in range(h))

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")
    return base64.b64encode(png).decode(), ((box[0] + box[2]) // 2, (box[1] + box[3]) // 2), box


def image(b64):
    return {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": b64}}


def versions(models):
    shot = [{"role": "user", "content": "Take a screenshot of the screen. Do nothing else."}]
    old = {"name": "computer", "display_width_px": 1280, "display_height_px": 800}
    for m in models:
        for label, tool, hdr in [("toolset", TOOLSET, {}),
                                 ("computer_20251124+beta", dict(old, type="computer_20251124"), {"anthropic-beta": "computer-use-2025-11-24"}),
                                 ("computer_20250124+beta", dict(old, type="computer_20250124"), {"anthropic-beta": "computer-use-2025-01-24"})]:
            n = "%s--%s" % (m, label)
            line(n, *call(n, "/v1/messages", {"model": m, "max_tokens": 300, "tools": [tool], "messages": shot}, hdr))


def roundtrip(models, sizes=((1280, 800), (2576, 1449), (2600, 1300))):
    prompt = "This is a test form in my browser. Take a screenshot, then click the SUBMIT button. Do not click anything else."
    for m in models:
        for w, h in sizes:
            b64, centre, box = page(w, h)
            first = [{"role": "user", "content": prompt}]
            n = "%s--rt-%dx%d" % (m, w, h)
            resp = line(n + "-1", *call(n + "-1", "/v1/messages", {"model": m, "max_tokens": 600, "tools": [TOOLSET], "messages": first}))
            blocks = [b for b in resp.get("content", []) if b.get("type") == "tool_use"] if isinstance(resp, dict) else []
            results = [{"type": "tool_result", "tool_use_id": b["id"], "toolset_name": "computer",
                        "content": [image(b64)] if b["name"] in ("screenshot", "zoom") else [{"type": "text", "text": "OK"}]} for b in blocks]
            msgs = first + [{"role": "assistant", "content": resp["content"]}, {"role": "user", "content": results}]
            resp = line(n + "-2", *call(n + "-2", "/v1/messages", {"model": m, "max_tokens": 600, "tools": [TOOLSET], "messages": msgs}))
            for b in resp.get("content", []) if isinstance(resp, dict) else []:
                if "coordinate" in b.get("input", {}):
                    x, y = b["input"]["coordinate"]
                    print("    click %s, true centre %s, inside button: %s" % ((x, y), centre, box[0] <= x < box[2] and box[1] <= y < box[3]))


def limits(models):
    for m in models:
        for w, h in [(2576, 1449), (2600, 1300), (2400, 1800)]:
            n = "%s--user-image-%dx%d" % (m, w, h)
            line(n, *call(n, "/v1/messages", {"model": m, "max_tokens": 16, "messages": [{"role": "user", "content": [
                image(page(w, h)[0]), {"type": "text", "text": "Reply OK."}]}]}))


def gpt(models):
    b64 = page(1280, 800)[0]
    q = "What words are on the two buttons in this image? If you cannot see an image, say NO IMAGE."
    for m in models:
        n = "%s--messages-vision" % m
        line(n, *call(n, "/v1/messages", {"model": m, "max_tokens": 400, "messages": [{"role": "user", "content": [image(b64), {"type": "text", "text": q}]}]}))
        n = "%s--chat-vision" % m
        line(n, *call(n, "/v1/chat/completions", {"model": m, "max_completion_tokens": 400, "messages": [{"role": "user", "content": [
            {"type": "text", "text": q}, {"type": "image_url", "image_url": {"url": "data:image/png;base64," + b64}}]}]}, bearer=True))
        n = "%s--responses-computer" % m
        line(n, *call(n, "/v1/responses", {"model": m, "tools": [{"type": "computer"}], "input": "Take a screenshot."}, bearer=True))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("group", choices=["versions", "roundtrip", "limits", "gpt"])
    ap.add_argument("--models")
    a = ap.parse_args()
    default = GPT if a.group == "gpt" else (CLAUDE if a.group == "versions" else CLAUDE[:1])
    globals()[a.group](a.models.split(",") if a.models else default)
