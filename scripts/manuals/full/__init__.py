# -*- coding: utf-8 -*-
"""รวมบทของคู่มือเล่มเต็มตามลำดับ (ไฟล์ที่ยังไม่มีจะถูกข้าม ไฟล์ที่มีข้อผิดพลาดจะแจ้งเตือนแล้วข้าม)"""
import importlib, sys, traceback

ORDER = ["intro", "s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9", "appendix"]
PARTS = []
for name in ORDER:
    try:
        mod = importlib.import_module(f"full.{name}")
    except ModuleNotFoundError as e:
        if e.name == f"full.{name}":
            continue
        print(f"[คำเตือน] นำเข้า full/{name}.py ไม่ได้: {e}", file=sys.stderr)
        continue
    except Exception:
        print(f"[คำเตือน] full/{name}.py มีข้อผิดพลาด ข้ามไฟล์นี้:", file=sys.stderr)
        traceback.print_exc(limit=2)
        continue
    PARTS.extend(mod.PARTS)
