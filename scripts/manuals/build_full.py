#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""สร้างคู่มือผู้ใช้ฉบับสมบูรณ์ (ระบบที่ 1-9) เป็น PDF เล่มเดียว -> public/manuals/manual-full.pdf

ถ่ายภาพหน้าจอจากเว็บในเครื่องที่ใช้ฐานข้อมูลทดสอบเท่านั้น (ห้ามถ่ายจากชุดใช้งานจริง ภาพจะมีข้อมูลบุคคลจริง)
เนื้อหาอยู่ที่ scripts/manuals/full/*.py (แยกตามระบบ) ใช้ตัวช่วยจาก full/dsl.py

ใช้: MANUAL_PASSWORD=<รหัสผ่านบัญชีทดสอบ> BASE_URL=http://localhost:3212 python3 scripts/manuals/build_full.py [--only s1,s2] [--no-pdf] [--reuse]
  --only    ถ่ายและพิมพ์เฉพาะบทที่ระบุ (ใช้ตรวจระหว่างเขียน; PDF จะมีเฉพาะบทเหล่านั้น)
  --reuse   ใช้ภาพเดิมที่มีในโฟลเดอร์ shots (ข้ามการถ่าย ภาพที่ไม่มีไฟล์จะถ่ายใหม่)
  --no-pdf  ถ่ายภาพอย่างเดียว (ภาพอยู่ที่ $TMPDIR/registry-manual-full/shots)
บัญชีที่บังคับยืนยันตัวตน 2 ขั้นต้องยังไม่เคยตั้ง หรือมีไฟล์รหัสลับเก็บไว้ (MANUAL_MFA_FILE)
"""
import asyncio, base64, datetime, hashlib, hmac, html, importlib, json, os, re, struct, subprocess, sys, tempfile, time

from playwright.async_api import async_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
BASE = os.environ.get("BASE_URL", "http://localhost:3212").rstrip("/")
PASSWORD = os.environ.get("MANUAL_PASSWORD", "")
OUT = os.path.join(ROOT, "public", "manuals")
FONTS = os.path.join(ROOT, "node_modules", "@fontsource", "sarabun", "files")
WORK = os.path.join(tempfile.gettempdir(), "registry-manual-full")  # นอกโครงการ ห้ามอยู่ใน public/
SHOTS = os.path.join(WORK, "shots")
MFA_FILE = os.environ.get("MANUAL_MFA_FILE", os.path.join(WORK, "mfa.json"))
THAI_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"]
CIRC = "①②③④⑤⑥⑦⑧⑨⑩"
REUSE = False  # --reuse: ใช้ภาพที่ถ่ายไว้แล้วในโฟลเดอร์ shots (ไม่ถ่ายใหม่) ใช้ตอนปรับแต่งเฉพาะการพิมพ์ PDF

ACCOUNTS = {
    "admin": "test.admin@example.com",
    "central": "test.central@example.com",
    "chief": "test.chief.amphoe@example.com",
    "fin": "test.finance@example.com",
    "jsp": "test.jsp@example.com",
    "quiz": "test.quiz@example.com",
    "sar": "test.saraban@example.com",
    "sart": "test.saraban.tambon@example.com",
    "secp": "test.secretary.changwat@example.com",
    "sect": "test.secretary.tambon@example.com",
    "sup": "test.supplies@example.com",
    "school": "test.school@example.com",
}


def totp(secret):
    key = base64.b32decode(secret.upper() + "=" * ((8 - len(secret) % 8) % 8))
    h = hmac.new(key, struct.pack(">Q", int(time.time() // 30)), hashlib.sha1).digest()
    o = h[-1] & 15
    return "%06d" % ((struct.unpack(">I", h[o:o + 4])[0] & 0x7FFFFFFF) % 1000000)


_last = {}


async def fresh_code(secret):
    while True:
        c = totp(secret)
        if _last.get(secret) != c and (30 - time.time() % 30) > 3:
            _last[secret] = c
            return c
        await asyncio.sleep(1)


def load_mfa():
    try:
        return json.load(open(MFA_FILE))
    except Exception:
        return {}


def save_mfa(d):
    os.makedirs(os.path.dirname(MFA_FILE), exist_ok=True)
    fd = os.open(MFA_FILE, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        json.dump(d, f)


async def settle(pg, ms=500):
    try:
        await pg.wait_for_load_state("networkidle", timeout=4000)
    except Exception:
        pass
    await pg.wait_for_timeout(ms)


async def login(browser, email, vp):
    ctx = await browser.new_context(viewport=vp, locale="th-TH", accept_downloads=True)
    pg = await ctx.new_page()
    await pg.goto(BASE + "/login")
    await pg.locator("#email").fill(email)
    await pg.locator("#password").fill(PASSWORD)
    await pg.get_by_role("button", name="เข้าสู่ระบบ", exact=True).click()
    await pg.wait_for_url(lambda u: "/login" not in u, timeout=20000)
    await settle(pg)
    if "/account/mfa" in pg.url:
        secrets = load_mfa()
        start = pg.get_by_role("button", name="เริ่มตั้งค่า")
        if await start.count():
            await start.click()
            secret = (await pg.get_by_test_id("mfa-secret").inner_text()).strip()
            secrets[email] = secret
            save_mfa(secrets)
            await pg.locator("#code").fill(await fresh_code(secret))
            await pg.get_by_role("button", name="ยืนยัน", exact=True).click()
            await pg.get_by_text("ยืนยันตัวตน 2 ขั้นสำเร็จ").wait_for(timeout=15000)
        else:
            if email not in secrets:
                raise SystemExit(f"{email} ตั้งยืนยันตัวตน 2 ขั้นไว้แล้วแต่ไม่มีรหัสลับ: รีเซ็ตฐานทดสอบหรือลบ auth.mfa_factors ของบัญชีนี้")
            await pg.locator("#code").fill(await fresh_code(secrets[email]))
            await pg.get_by_role("button", name="ยืนยัน", exact=True).click()
            await pg.wait_for_url(lambda u: "/account/mfa" not in u, timeout=15000)
        await settle(pg)
    return ctx, pg


def loc(pg, sel):
    """ตัวเลือกแบบย่อ: css:..  btn:ข้อความ  link:ข้อความ  text:ข้อความ  label:ข้อความ  tid:รหัส  (ไม่มีคำนำหน้า = ข้อความ)"""
    if sel.startswith("css:"):
        return pg.locator(sel[4:])
    if sel.startswith("btn:"):
        return pg.get_by_role("button", name=re.compile(sel[4:]))
    if sel.startswith("link:"):
        return pg.get_by_role("link", name=re.compile(sel[5:]))
    if sel.startswith("label:"):
        return pg.get_by_label(re.compile(sel[6:]))
    if sel.startswith("tid:"):
        return pg.get_by_test_id(sel[4:])
    if sel.startswith("text:"):
        sel = sel[5:]
    return pg.get_by_text(sel, exact=False)


async def act(pg, a):
    k = a[0]
    if k == "goto":
        await pg.goto(BASE + a[1]); await pg.wait_for_load_state("load"); await settle(pg)
    elif k == "click":
        await loc(pg, a[1]).first.click(timeout=8000); await settle(pg, 700)
    elif k == "fill":
        await loc(pg, a[1]).first.fill(a[2], timeout=8000)
    elif k == "select":
        l = loc(pg, a[1]).first
        vals = await l.locator("option").evaluate_all("os => os.map(o => [o.value, o.textContent])")
        v = [x for x, t in vals if x == a[2] or re.search(a[2], t or "")]
        if not v:
            raise RuntimeError(f"ไม่พบตัวเลือก {a[2]} ใน {vals[:8]}")
        await l.select_option(value=v[0]); await settle(pg, 600)
    elif k == "link":
        href = await loc(pg, a[1]).first.get_attribute("href", timeout=8000)
        await pg.goto(BASE + href); await pg.wait_for_load_state("load"); await settle(pg)
    elif k == "wait":
        await pg.wait_for_timeout(a[1])
    elif k == "scroll":
        await loc(pg, a[1]).first.scroll_into_view_if_needed(timeout=8000); await pg.wait_for_timeout(300)
    elif k == "press":
        await pg.keyboard.press(a[1]); await settle(pg, 600)
    elif k == "eval":
        await pg.evaluate(a[1])
    elif k == "upload":
        await loc(pg, a[1]).first.set_input_files(a[2]); await settle(pg, 800)
    elif k == "check":
        await loc(pg, a[1]).first.check(timeout=8000)
    elif k == "dialog":
        pass
    else:
        raise RuntimeError(f"คำสั่งไม่รู้จัก {k}")


async def highlight(pg, sels):
    n = 0
    for s in sels:
        l = loc(pg, s)
        try:
            el = l.first
            await el.scroll_into_view_if_needed(timeout=4000)
            n += 1
            await el.evaluate(
                """(e, n) => { const r = e.getBoundingClientRect(); const b = document.createElement('div');
                b.setAttribute('data-manual-hl', '1');
                b.style.cssText = `position:absolute;left:${r.left + scrollX - 4}px;top:${r.top + scrollY - 4}px;width:${r.width + 8}px;height:${r.height + 8}px;border:3px solid #d62828;border-radius:6px;pointer-events:none;z-index:99999;box-shadow:0 0 0 2px rgba(255,255,255,.7)`;
                const t = document.createElement('div'); t.textContent = String.fromCharCode(0x2460 + n - 1);
                t.style.cssText = 'position:absolute;left:-14px;top:-18px;background:#d62828;color:#fff;border-radius:11px;min-width:22px;height:22px;line-height:22px;text-align:center;font:700 14px sans-serif;padding:0 3px';
                b.appendChild(t); document.body.appendChild(b); }""",
                n,
            )
        except Exception as e:
            raise RuntimeError(f"ไม่พบจุดที่เน้น {s!r}: {str(e)[:120]}")


class Pool:
    def __init__(self, browser):
        self.browser = browser
        self.pages = {}

    async def get(self, who, vp):
        key = (who, vp[0], vp[1])
        if key not in self.pages:
            if who == "anon":
                ctx = await self.browser.new_context(viewport={"width": vp[0], "height": vp[1]}, locale="th-TH", accept_downloads=True)
                pg = await ctx.new_page()
            else:
                ctx, pg = await login(self.browser, ACCOUNTS[who], {"width": vp[0], "height": vp[1]})
            self.pages[key] = (ctx, pg)
        return self.pages[key][1]


def shot_key(s):
    return hashlib.md5(json.dumps([s.get("who"), s.get("path"), s.get("pre"), s.get("hl"), s.get("full"), s.get("el"), s.get("vp")], sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:12]


async def take(pool, s, cache, problems, ctxname):
    key = shot_key(s)
    if key in cache:
        return cache[key]
    vp = tuple(s.get("vp") or (1280, 800))
    pg = await pool.get(s["who"], vp)
    file = os.path.join(SHOTS, key + ".jpg")
    if REUSE and os.path.exists(file):
        cache[key] = file
        return file
    try:
        if s.get("path"):
            await pg.goto(BASE + s["path"]); await pg.wait_for_load_state("load"); await settle(pg)
        for a in s.get("pre") or []:
            await act(pg, a)
        if s.get("hl"):
            await highlight(pg, s["hl"])
            await pg.wait_for_timeout(200)
        if s.get("el"):
            await loc(pg, s["el"]).first.screenshot(path=file, type="jpeg", quality=64)
        elif s.get("full"):
            await pg.screenshot(path=file, type="jpeg", quality=64, full_page=True)
        else:
            await pg.screenshot(path=file, type="jpeg", quality=64)
        await pg.evaluate("document.querySelectorAll('[data-manual-hl]').forEach(e => e.remove())")
        cache[key] = file
    except Exception as e:
        problems.append((ctxname, s.get("who"), s.get("path"), str(e)[:200]))
        cache[key] = None
        try:
            await pg.evaluate("document.querySelectorAll('[data-manual-hl]').forEach(e => e.remove())")
        except Exception:
            pass
    return cache[key]


def small_copy(file, max_w=1280, quality=44):
    """เข้ารหัสภาพใหม่ก่อนใส่ใน PDF: คงความกว้างเต็ม 1280 px (คมชัด) ลดคุณภาพ JPEG เล็กน้อย
    แล้วบีบแบบไม่สูญเสียด้วย mozjpeg เพื่อให้ไฟล์รวมไม่เกินประมาณ 25 MB
    (Chromium ฝัง JPEG ลง PDF ตามที่ให้ ขนาดภาพจึงเป็นตัวกำหนดขนาดไฟล์)"""
    if not file: return file
    import io
    from PIL import Image
    out_dir = os.path.join(WORK, "small"); os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, os.path.basename(file))
    if os.path.exists(out) and os.path.getmtime(out) >= os.path.getmtime(file) and os.path.getmtime(out) >= os.path.getmtime(__file__): return out
    im = Image.open(file).convert("RGB")
    if im.width > max_w: im = im.resize((max_w, round(im.height * max_w / im.width)), Image.LANCZOS)
    buf = io.BytesIO(); im.save(buf, "JPEG", quality=quality, optimize=True)
    data = buf.getvalue()
    try:
        import mozjpeg_lossless_optimization as moz
        data = moz.optimize(data)
    except ImportError:
        pass
    with open(out, "wb") as fh: fh.write(data)
    return out


def thai_today():
    d = datetime.date.today()
    return f"{d.day} {THAI_MONTHS[d.month - 1]} {d.year + 543}"


def esc(t):
    return html.escape(t, quote=False)


def render_blocks(blocks, shotfile, counter):
    out = []
    for b in blocks:
        t = b["t"]
        if t == "p":
            out.append(f"<p>{esc(b['text'])}</p>")
        elif t == "steps":
            out.append("<ol class='steps'>" + "".join(f"<li>{esc(i)}</li>" for i in b["items"]) + "</ol>")
        elif t == "ul":
            out.append("<ul>" + "".join(f"<li>{esc(i)}</li>" for i in b["items"]) + "</ul>")
        elif t in ("note", "warn", "tip"):
            label = {"note": "หมายเหตุ", "warn": "ข้อควรระวัง", "tip": "เคล็ดลับ"}[t]
            out.append(f"<div class='box {t}'><b>{label}</b> {esc(b['text'])}</div>")
        elif t == "h3":
            out.append(f"<h4>{esc(b['text'])}</h4>")
        elif t == "table":
            head = "".join(f"<th>{esc(h)}</th>" for h in b["head"])
            rows = "".join("<tr>" + "".join(f"<td>{esc(str(c))}</td>" for c in r) + "</tr>" for r in b["rows"])
            out.append(f"<table class='t'><thead><tr>{head}</tr></thead><tbody>{rows}</tbody></table>")
        elif t == "shot":
            counter[0] += 1
            f = shotfile(b)
            cap = esc(b["caption"])
            if f:
                out.append(f"<figure><img src='file://{f}' alt='{cap}'><figcaption><b>ภาพที่ {counter[0]}</b> {cap}</figcaption></figure>")
            else:
                out.append(f"<div class='box warn'>[ภาพที่ {counter[0]} ถ่ายไม่สำเร็จ] {cap}</div>")
    return "".join(out)


def render(parts, shotfile, toc_pages, only_note):
    font = lambda w: f"@font-face{{font-family:Sarabun;font-weight:{w};src:url('file://{FONTS}/sarabun-thai-{w}-normal.woff2') format('woff2'),url('file://{FONTS}/sarabun-latin-{w}-normal.woff2') format('woff2');}}"
    css = f"""{font(400)}{font(600)}{font(700)}
body{{font-family:Sarabun,sans-serif;color:#2a190c;font-size:14.5px;line-height:1.6;margin:0}}
.cover{{height:255mm;display:flex;flex-direction:column;justify-content:center;border-left:12px solid #d9a520;padding-left:18mm;page-break-after:always}}
.cover h1{{font-size:40px;color:#4e2d12;margin:0}} .cover h2{{font-size:24px;margin:10px 0 0;font-weight:600}} .cover p{{margin:4px 0;color:#5f4d3d}}
h1.part{{page-break-before:always;color:#4e2d12;font-size:28px;border-bottom:4px solid #d9a520;padding-bottom:6px;margin:0 0 6px}}
.lead{{color:#5f4d3d;margin:0 0 12px}}
h2.sec{{color:#4e2d12;font-size:19px;border-bottom:2px solid #d9a520;padding-bottom:3px;margin:20px 0 6px;page-break-after:avoid}}
h4{{margin:10px 0 2px;font-size:15px;color:#4e2d12;page-break-after:avoid}}
.tag{{display:inline-block;background:#f1e7d0;color:#4e2d12;border-radius:10px;padding:0 8px;font-size:12px;margin-left:6px;font-weight:600}}
ol.steps{{margin:4px 0 6px;padding-left:24px}} ol.steps li,ul li{{margin:3px 0}} ul{{margin:4px 0 6px;padding-left:22px}}
figure{{margin:8px 0 12px;border:1px solid #e4d8c0;border-radius:6px;overflow:hidden;page-break-inside:avoid}} figure img{{width:100%;display:block}}
figcaption{{font-size:12.5px;color:#5f4d3d;padding:4px 8px;background:#f8f4ec}}
.box{{border-radius:6px;padding:7px 12px;margin:8px 0;page-break-inside:avoid}} .note{{background:#fbf3dc;border:1px solid #e4d8c0}} .warn{{background:#fdeaea;border:1px solid #e9b4b4}} .tip{{background:#e8f3ea;border:1px solid #b7d6bd}}
.box b{{margin-right:6px}}
table.t{{border-collapse:collapse;width:100%;margin:6px 0 10px;font-size:13px;page-break-inside:auto}} table.t th{{background:#4e2d12;color:#fff;text-align:left;padding:4px 6px}} table.t td{{border:1px solid #e4d8c0;padding:3px 6px;vertical-align:top}} table.t tr{{page-break-inside:avoid}}
.toc{{page-break-before:always}} .toc h1{{color:#4e2d12;font-size:26px;border-bottom:4px solid #d9a520;padding-bottom:6px}}
.toc .l{{display:flex;gap:6px;margin:2px 0}} .toc .l span.d{{flex:1;border-bottom:1px dotted #b9a888;margin:0 4px 5px}} .toc .p{{font-weight:700;margin-top:10px;color:#4e2d12}} .toc .c{{padding-left:22px;font-size:13.5px}}
.mk{{font-size:1px;color:#fff;margin-left:2px}}
"""
    h = [f"<!doctype html><html lang='th'><head><meta charset='utf-8'><style>{css}</style></head><body>"]
    h.append(f"<div class='cover'><p>เว็บไซต์กองบริหารทะเบียนและวัดผล</p><h1>คู่มือการใช้งาน</h1><h2>ฉบับสมบูรณ์ ระบบที่ 1 ถึง 9 ตามบทเรียน</h2>"
             f"<p style='margin-top:20px'>สำหรับเลขานุการ เจ้าคณะ เจ้าหน้าที่สำนักเรียน เจ้าหน้าที่ส่วนกลาง เจ้าหน้าที่การเงิน พัสดุ สารบรรณ ผู้จัดการคลังข้อสอบ และผู้ดูแลระบบ</p>"
             f"<p style='margin-top:20px'>ฉบับวันที่ {thai_today()}</p><p>ภาพหน้าจอในคู่มือนี้ใช้ข้อมูลทดสอบ (ชื่อขึ้นต้น (ทดสอบ) หรือรหัส TEST) ไม่ใช่ข้อมูลจริง</p>{only_note}</div>")
    # สารบัญ
    h.append("<div class='toc'><h1>สารบัญ</h1>")
    for p in parts:
        pg = toc_pages.get(p["id"], "")
        h.append(f"<div class='l p'><span>{esc(p['title'])}</span><span class='d'></span><span>{pg}</span></div>")
        for i, s in enumerate(p.get("sections", []), 1):
            sid = f"{p['id']}.{i}"
            h.append(f"<div class='l c'><span>{i}. {esc(s['title'])}</span><span class='d'></span><span>{toc_pages.get(sid, '')}</span></div>")
    h.append("</div>")
    counter = [0]
    for p in parts:
        h.append(f"<h1 class='part'>{esc(p['title'])}<span class='mk' aria-hidden='true'>§{p['id']}§</span></h1>")
        if p.get("subtitle"):
            h.append(f"<p class='lead'>{esc(p['subtitle'])}</p>")
        h.append(render_blocks(p.get("intro", []), shotfile, counter))
        for i, s in enumerate(p.get("sections", []), 1):
            tag = f"<span class='tag'>{esc(s['lesson'])}</span>" if s.get("lesson") else ""
            h.append(f"<h2 class='sec'>{i}. {esc(s['title'])}{tag}<span class='mk' aria-hidden='true'>§{p['id']}.{i}§</span></h2>")
            h.append(render_blocks(s["blocks"], shotfile, counter))
    h.append("</body></html>")
    return "".join(h), counter[0]


def collect_shots(parts):
    out = []
    for p in parts:
        for b in p.get("intro", []):
            if b["t"] == "shot":
                out.append((p["id"], b))
        for i, s in enumerate(p.get("sections", []), 1):
            for b in s["blocks"]:
                if b["t"] == "shot":
                    out.append((f"{p['id']}.{i}", b))
    return out


def page_texts(pdf):
    n = int(re.search(r"Pages:\s+(\d+)", subprocess.run(["pdfinfo", pdf], capture_output=True, text=True).stdout).group(1))
    txt = subprocess.run(["pdftotext", "-layout", pdf, "-"], capture_output=True, text=True).stdout.split("\f")
    return n, txt


def find_pages(parts, pdf):
    n, txt = page_texts(pdf)
    pages = {}
    for j, t in enumerate(txt):
        for m in re.findall(r"§([^§\s]+)§", t):
            pages.setdefault(m, j + 1)
    return pages


async def main():
    if not PASSWORD:
        raise SystemExit("ตั้งค่า MANUAL_PASSWORD (รหัสผ่านบัญชีทดสอบ) ก่อน")
    args = sys.argv[1:]
    global REUSE
    REUSE = "--reuse" in args
    only = None
    if "--only" in args:
        only = set(args[args.index("--only") + 1].split(","))
    no_pdf = "--no-pdf" in args
    import full  # noqa
    parts = [p for p in full.PARTS if not only or p["id"] in only]
    os.makedirs(SHOTS, exist_ok=True)
    shots = collect_shots(parts)
    cache, problems = {}, []
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        pool = Pool(browser)
        for ctxname, b in shots:
            b["_file"] = await take(pool, b, cache, problems, ctxname)
        print(f"ภาพ {len(shots)} รายการ ({len([1 for v in cache.values() if v])} ภาพไม่ซ้ำ)")
        for pr in problems:
            print("ถ่ายไม่สำเร็จ:", pr)
        if no_pdf:
            await browser.close()
            return
        page = await (await browser.new_context()).new_page()
        shotfile = lambda b: small_copy(b.get("_file"))
        note = f"<p style='color:#b00'>[ฉบับตรวจบางบท: {', '.join(sorted(only))}]</p>" if only else ""
        os.makedirs(OUT, exist_ok=True)
        target = os.path.join(OUT, "manual-full.pdf") if not only else os.path.join(WORK, "partial.pdf")
        toc_pages = {}
        for pass_no in (1, 2):
            doc, nshots = render(parts, shotfile, toc_pages, note)
            hf = os.path.join(WORK, "full.html")
            open(hf, "w", encoding="utf-8").write(doc)
            await page.goto("file://" + hf)
            await page.wait_for_timeout(1500)
            await page.pdf(path=target, format="A4", print_background=True, margin={"top": "15mm", "bottom": "17mm", "left": "15mm", "right": "15mm"},
                           display_header_footer=True, header_template="<span></span>", outline=True, tagged=True,
                           footer_template="<div style=\"font-size:9px;width:100%;text-align:center;color:#5f4d3d\">คู่มือการใช้งานฉบับสมบูรณ์ ระบบที่ 1–9 · หน้า <span class=\"pageNumber\"></span> / <span class=\"totalPages\"></span></div>")
            if pass_no == 1:
                toc_pages = find_pages(parts, target)
        # บีบโครงสร้าง PDF เพิ่ม (ไม่แตะภาพ สารบัญและโครงเรื่องคงเดิม) ลดได้ราว 1.5-2 MB
        if subprocess.run(["which", "qpdf"], capture_output=True).returncode == 0:
            tmp = target + ".opt"
            r = subprocess.run(["qpdf", "--object-streams=generate", "--compress-streams=y", "--recompress-flate", "--compression-level=9", target, tmp], capture_output=True)
            if r.returncode in (0, 3) and os.path.exists(tmp): os.replace(tmp, target)
        print(f"{target}: {nshots} ภาพ, สารบัญหาหน้าพบ {len(toc_pages)} รายการ")
        await browser.close()
    if problems:
        sys.exit(2)


if __name__ == "__main__":
    asyncio.run(main())
