#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""สร้างคู่มือผู้ใช้ PDF แยกตามบทบาท (บทที่ 32) ถ่ายภาพหน้าจอจากเว็บในเครื่องที่มีข้อมูลทดสอบ แล้วพิมพ์เป็น PDF ลง public/manuals/

ใช้กับเว็บในเครื่องที่ต่อฐานข้อมูลทดสอบเท่านั้น (ห้ามถ่ายจากชุดใช้งานจริง เพราะภาพจะมีข้อมูลบุคคลจริง)
ต้องมี: python3 + playwright (pip install playwright) และ Chromium, เว็บเปิดอยู่ (npm run build && npm start),
บัญชีทดสอบตาม content.py ที่ใช้รหัสผ่านเดียวกัน (npm run seed:test-users)

ใช้: MANUAL_PASSWORD=<รหัสผ่านบัญชีทดสอบ> BASE_URL=http://localhost:3002 python3 scripts/manuals/build.py [secretary chief school admin]
บัญชีที่บังคับยืนยันตัวตน 2 ขั้นต้องยังไม่เคยตั้ง (สคริปต์ตั้งให้เองในฐานทดสอบ)
"""
import asyncio
import base64
import datetime
import hashlib
import hmac
import html
import os
import struct
import sys
import tempfile
import time

from playwright.async_api import async_playwright

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from content import COMMON_END, COMMON_START, MANUALS  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
BASE = os.environ.get("BASE_URL", "http://localhost:3002").rstrip("/")
PASSWORD = os.environ.get("MANUAL_PASSWORD", "")
OUT = os.path.join(ROOT, "public", "manuals")
FONTS = os.path.join(ROOT, "node_modules", "@fontsource", "sarabun", "files")
# ภาพหน้าจอและ HTML ชั่วคราวเก็บนอกโครงการ (ห้ามอยู่ใน public/ เพราะจะถูกเผยแพร่)
WORK = os.path.join(tempfile.gettempdir(), "registry-manual-shots")
THAI_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"]


def totp(secret: str) -> str:
    key = base64.b32decode(secret.upper() + "=" * ((8 - len(secret) % 8) % 8))
    h = hmac.new(key, struct.pack(">Q", int(time.time() // 30)), hashlib.sha1).digest()
    o = h[-1] & 15
    return "%06d" % ((struct.unpack(">I", h[o:o + 4])[0] & 0x7FFFFFFF) % 1000000)


async def fresh_code(secret: str, last: dict) -> str:
    while True:
        c = totp(secret)
        if last.get(secret) != c and (30 - time.time() % 30) > 3:
            last[secret] = c
            return c
        await asyncio.sleep(1)


async def settle(pg):
    try:
        await pg.wait_for_load_state("networkidle", timeout=4000)
    except Exception:
        pass
    await pg.wait_for_timeout(600)


async def login(browser, email):
    ctx = await browser.new_context(viewport={"width": 1280, "height": 800}, locale="th-TH")
    pg = await ctx.new_page()
    await pg.goto(BASE + "/login")
    await pg.locator("#email").fill(email)
    await pg.locator("#password").fill(PASSWORD)
    await pg.get_by_role("button", name="เข้าสู่ระบบ", exact=True).click()
    await pg.wait_for_url(lambda u: "/login" not in u, timeout=20000)
    await settle(pg)
    if "/account/mfa" in pg.url:
        start = pg.get_by_role("button", name="เริ่มตั้งค่า")
        if not await start.count():
            raise SystemExit(f"{email} ตั้งยืนยันตัวตน 2 ขั้นไว้แล้ว ใช้ฐานทดสอบที่รีเซ็ตใหม่")
        await start.click()
        secret = (await pg.get_by_test_id("mfa-secret").inner_text()).strip()
        await pg.locator("#code").fill(await fresh_code(secret, {}))
        await pg.get_by_role("button", name="ยืนยัน", exact=True).click()
        await pg.get_by_text("ยืนยันตัวตน 2 ขั้นสำเร็จ").wait_for(timeout=15000)
    return ctx, pg


async def shoot(pg, path, name):
    if path:
        await pg.goto(BASE + path)
        await pg.wait_for_load_state("load")
        await settle(pg)
    file = os.path.join(WORK, name + ".jpg")
    os.makedirs(os.path.dirname(file), exist_ok=True)
    await pg.screenshot(path=file, type="jpeg", quality=72)
    with open(file, "rb") as f:
        return "data:image/jpeg;base64," + base64.b64encode(f.read()).decode()


async def special(pg, kind):
    """ภาพที่ต้องเปิดจากรายการก่อน: คำขอที่รอพิจารณา / บัญชีสมัครสอบ"""
    if kind == "approval":
        await pg.goto(BASE + "/app/approvals")
        await settle(pg)
        link = pg.locator('main a[href^="/app/approvals/"]').first
    else:
        await pg.goto(BASE + "/app/exams/batches")
        await settle(pg)
        link = pg.locator('main a[href^="/app/exams/batches/"]:not([href$="/new"])').first
    if await link.count():
        await pg.goto(BASE + await link.get_attribute("href"))
        await pg.wait_for_load_state("load")
        await settle(pg)
    return None


def thai_today():
    d = datetime.date.today()
    return f"{d.day} {THAI_MONTHS[d.month - 1]} {d.year + 543}"


def render(manual, sections):
    font = lambda w: f"@font-face{{font-family:Sarabun;font-weight:{w};src:url('file://{FONTS}/sarabun-thai-{w}-normal.woff2') format('woff2'),url('file://{FONTS}/sarabun-latin-{w}-normal.woff2') format('woff2');}}"
    parts = [f"""<!doctype html><html lang="th"><head><meta charset="utf-8"><style>
{font(400)}{font(600)}{font(700)}
body{{font-family:Sarabun,sans-serif;color:#2a190c;font-size:15.5px;line-height:1.65;margin:0}}
.cover{{height:250mm;display:flex;flex-direction:column;justify-content:center;border-left:10px solid #d9a520;padding-left:18mm;page-break-after:always}}
.cover h1{{font-size:34px;color:#4e2d12;margin:0}} .cover h2{{font-size:24px;margin:8px 0 0;font-weight:600}}
.cover p{{margin:4px 0;color:#5f4d3d}}
h2.sec{{color:#4e2d12;font-size:21px;border-bottom:3px solid #d9a520;padding-bottom:4px;margin:0 0 8px}}
section{{page-break-inside:avoid;margin-bottom:18px}} ol{{margin:0 0 8px;padding-left:22px}} li{{margin:2px 0}}
figure{{margin:6px 0 0;border:1px solid #e4d8c0;border-radius:6px;overflow:hidden}} figure img{{width:100%;display:block}}
figcaption{{font-size:13px;color:#5f4d3d;padding:4px 8px;background:#f8f4ec}}
.note{{background:#fbf3dc;border:1px solid #e4d8c0;border-radius:6px;padding:8px 12px;margin:10px 0}}
.toc li{{margin:4px 0}}
</style></head><body>
<div class="cover"><p>เว็บไซต์กองบริหารทะเบียนและวัดผล</p><h1>คู่มือผู้ใช้</h1><h2>บทบาท {html.escape(manual['role'])}</h2>
<p style="margin-top:18px">{html.escape(manual['intro'])}</p><p style="margin-top:18px">ฉบับวันที่ {thai_today()}</p>
<p>ภาพหน้าจอในคู่มือนี้ใช้ข้อมูลทดสอบ ไม่ใช่ข้อมูลจริง</p></div>
<h2 class="sec">สารบัญ</h2><ol class="toc">"""]
    parts += [f"<li>{html.escape(s['title'])}</li>" for s, _ in sections]
    parts.append("</ol>")
    if manual.get("mfa_note"):
        parts.append(f'<p class="note">{html.escape(manual["mfa_note"])}</p>')
    for i, (s, img) in enumerate(sections, 1):
        parts.append(f'<section><h2 class="sec">{i}. {html.escape(s["title"])}</h2><ol>')
        parts += [f"<li>{html.escape(t)}</li>" for t in s["steps"]]
        parts.append("</ol>")
        if img:
            parts.append(f'<figure><img src="{img}" alt="ภาพหน้าจอ {html.escape(s["title"])}"><figcaption>ภาพที่ {i} {html.escape(s["title"])}</figcaption></figure>')
        parts.append("</section>")
    parts.append("</body></html>")
    return "".join(parts)


async def build(browser, key):
    manual = MANUALS[key]
    ctx, pg = await login(browser, manual["account"])
    anon = await browser.new_context(viewport={"width": 1280, "height": 800}, locale="th-TH")
    apg = await anon.new_page()
    sections = []
    for i, s in enumerate(COMMON_START + manual["sections"] + COMMON_END):
        img = None
        if s["shot"]:
            who, path = s["shot"]
            name = f"{key}-{i:02d}"
            if who == "anon":
                img = await shoot(apg, path, name)
            elif who == "self":
                img = await shoot(pg, path, name)
            else:
                await special(pg, who)
                img = await shoot(pg, None, name)
        sections.append((s, img))
    await anon.close()
    out = await ctx.new_page()
    os.makedirs(WORK, exist_ok=True)
    html_file = os.path.join(WORK, f"{key}.html")
    with open(html_file, "w", encoding="utf-8") as f:
        f.write(render(manual, sections))
    await out.goto("file://" + html_file)
    await out.wait_for_timeout(800)
    await out.pdf(
        path=os.path.join(OUT, manual["file"]),
        format="A4",
        print_background=True,
        margin={"top": "16mm", "bottom": "18mm", "left": "16mm", "right": "16mm"},
        display_header_footer=True,
        header_template="<span></span>",
        footer_template=f'<div style="font-size:9px;width:100%;text-align:center;color:#5f4d3d">คู่มือผู้ใช้ บทบาท {html.escape(manual["role"])} · หน้า <span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    )
    await ctx.close()
    print(f"{manual['file']}: {len([1 for _, img in sections if img])} ภาพ")


async def main():
    if not PASSWORD:
        raise SystemExit("ตั้งค่า MANUAL_PASSWORD (รหัสผ่านบัญชีทดสอบ) ก่อน")
    keys = sys.argv[1:] or list(MANUALS)
    os.makedirs(OUT, exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        for key in keys:
            await build(browser, key)
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
