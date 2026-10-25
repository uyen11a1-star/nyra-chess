#!/usr/bin/env python3
"""Vá index.html cho tab Puzzle + bánh răng cài đặt (chạy nhiều lần cũng an toàn)."""
import re, sys
p = "index.html"
s = open(p, encoding="utf-8").read()
changed = []

def sub(old, new, tag):
    global s
    if old in s:
        s = s.replace(old, new, 1); changed.append(tag)

# 1) bánh răng cạnh trạng thái kết nối
if 'id="settingsBtn"' not in s:
    old = '<div class="top-status"><span class="status-dot"></span><span id="connectionLabel">BÀN CỜ SẴN SÀNG</span></div>'
    if old not in s: sys.exit("Không thấy khối top-status trong index.html")
    s = s.replace(old, '<div class="top-right">\n      ' + old + '\n      <button class="gear-btn" id="settingsBtn" type="button" aria-label="Cài đặt" title="Cài đặt">⚙</button>\n    </div>', 1)
    changed.append("gear")
# 2) mục Puzzle trong menu ☰
if 'id="drawerPuzzle"' not in s:
    m = re.search(r'^( *)<a class="navdrawer-item" data-drawer="arena"', s, re.M)
    if not m: sys.exit("Không thấy mục menu Arena")
    s = s[:m.start()] + m.group(1) + '<a class="navdrawer-item" data-drawer="puzzle" href="#" id="drawerPuzzle"><span>🧩</span> Puzzle</a>\n' + s[m.start():]
    changed.append("drawer")
# 3) nút tab Puzzle
if 'data-tab="puzzle"' not in s:
    m = re.search(r'^( *)<button class="tab-btn" data-tab="arena">', s, re.M)
    if not m: sys.exit("Không thấy nút tab Arena")
    s = s[:m.start()] + m.group(1) + '<button class="tab-btn" data-tab="puzzle">Puzzle</button>\n' + s[m.start():]
    changed.append("tab-btn")
# 4) vùng nội dung tab Puzzle
if 'id="tab-puzzle"' not in s:
    m = re.search(r'^( *)<div id="tab-arena" class="tab-content">', s, re.M)
    if not m: sys.exit("Không thấy vùng tab-arena")
    s = s[:m.start()] + m.group(1) + '<!-- TAB: PUZZLE -->\n' + m.group(1) + '<div id="tab-puzzle" class="tab-content"></div>\n\n' + s[m.start():]
    changed.append("tab-content")
# 5) nâng số phiên bản để trình duyệt tải lại
s2 = re.sub(r'style\.css\?v=\d+', 'style.css?v=212', s); s2 = re.sub(r'app\.js\?v=\d+', 'app.js?v=212', s2)
if s2 != s: s = s2; changed.append("version")
open(p, "w", encoding="utf-8").write(s)
print("Đã vá index.html:", ", ".join(changed) if changed else "(không có gì cần đổi)")
