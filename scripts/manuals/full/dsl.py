# -*- coding: utf-8 -*-
"""ตัวช่วยเขียนเนื้อหาคู่มือเล่มเต็ม (ใช้ในไฟล์ s1.py ... s9.py)

ตัวอย่าง:
    SECTION("เพิ่มบุคคล", "บทที่ 5", [
        P("คำอธิบายสั้น ๆ"),
        STEPS(["กดเมนู บุคลากร", "กดปุ่ม เพิ่มบุคคล"]),
        SHOT("sect", "/app/personnel", "หน้ารายชื่อบุคลากร ① ปุ่มเพิ่มบุคคล", hl=["btn:เพิ่มบุคคล"]),
        NOTE("..."), WARN("..."), TIP("..."),
        TABLE(["หัว1", "หัว2"], [["a", "b"]]),
    ])

SHOT(who, path, caption, pre=None, hl=None, full=False, el=None, vp=None)
  who : anon | admin | central | chief | fin | jsp | quiz | sar | sart | secp | sect | sup | school
  path: เส้นทางเริ่มต้น เช่น "/app/personnel"
  pre : รายการคำสั่งหลังเปิดหน้า เช่น [("click","btn:เพิ่มบุคคล"), ("fill","label:ชื่อ","สมชาย"), ("select","css:select[name=x]","ตรี"), ("link","css:main table a"), ("wait",500), ("scroll","text:ประวัติ")]
  hl  : รายการจุดที่เน้นกรอบแดงพร้อมเลข ①②③ (ตามลำดับ) เช่น ["btn:เพิ่มบุคคล", "css:#q"] ; คำบรรยายใต้ภาพควรอ้างถึงเลขเหล่านี้
  full: ถ่ายทั้งหน้า (ใช้กับหน้ายาวเท่านั้น) / el: ถ่ายเฉพาะส่วน เช่น "css:main" / vp: (กว้าง, สูง) เช่น (390, 844) สำหรับมือถือ
ตัวเลือกจุดอ้างอิง: css:..  btn:ข้อความ  link:ข้อความ  label:ข้อความ  tid:รหัส  text:ข้อความ  (ข้อความจับแบบ regex บางส่วน)
"""


def P(text):
    return {"t": "p", "text": text}


def STEPS(items):
    return {"t": "steps", "items": items}


def UL(items):
    return {"t": "ul", "items": items}


def NOTE(text):
    return {"t": "note", "text": text}


def WARN(text):
    return {"t": "warn", "text": text}


def TIP(text):
    return {"t": "tip", "text": text}


def H3(text):
    return {"t": "h3", "text": text}


def TABLE(head, rows):
    return {"t": "table", "head": head, "rows": rows}


def SHOT(who, path, caption, pre=None, hl=None, full=False, el=None, vp=None):
    return {"t": "shot", "who": who, "path": path, "caption": caption, "pre": pre, "hl": hl, "full": full, "el": el, "vp": vp}


def SECTION(title, lesson, blocks):
    return {"title": title, "lesson": lesson, "blocks": blocks}


def PART(id, title, subtitle, intro, sections):
    return {"id": id, "title": title, "subtitle": subtitle, "intro": intro, "sections": sections}
