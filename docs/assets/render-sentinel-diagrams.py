#!/usr/bin/env python3
"""Render 3 sentinel diagrams — Vigilant Circuitry philosophy, 2400x1350, large fonts."""

from PIL import Image, ImageDraw, ImageFont
import os
import math

FONTS_DIR = r"C:\Users\ferna\.claude\skills\anthropics-canvas-design\canvas-fonts"
OUT_DIR = r"C:\Users\ferna\.claude\plugins\cache\FX-studio-AI\pipeline-orchestrator\3.0.2\docs\assets"

# --- Color Palette ---
BG = (13, 13, 20)
PRIMARY = (124, 58, 237)
PRIMARY_DIM = (90, 40, 170)
PRIMARY_GLOW = (155, 100, 255)
PASS_GREEN = (16, 185, 129)
CORRECTED_AMBER = (245, 158, 11)
BLOCKED_RED = (239, 68, 68)
TEXT_WHITE = (240, 240, 245)
TEXT_DIM = (148, 148, 168)
TEXT_MUTED = (100, 100, 120)
SURFACE = (25, 25, 35)
LINE_DIM = (50, 45, 70)

W, H = 2400, 1350

def load_fonts():
    fonts = {}
    try:
        fonts['title'] = ImageFont.truetype(os.path.join(FONTS_DIR, "BigShoulders-Bold.ttf"), 56)
        fonts['heading'] = ImageFont.truetype(os.path.join(FONTS_DIR, "InstrumentSans-Bold.ttf"), 28)
        fonts['body'] = ImageFont.truetype(os.path.join(FONTS_DIR, "InstrumentSans-Regular.ttf"), 22)
        fonts['mono'] = ImageFont.truetype(os.path.join(FONTS_DIR, "JetBrainsMono-Regular.ttf"), 19)
        fonts['mono_bold'] = ImageFont.truetype(os.path.join(FONTS_DIR, "JetBrainsMono-Bold.ttf"), 20)
        fonts['label'] = ImageFont.truetype(os.path.join(FONTS_DIR, "GeistMono-Regular.ttf"), 17)
        fonts['tiny'] = ImageFont.truetype(os.path.join(FONTS_DIR, "GeistMono-Regular.ttf"), 15)
        fonts['section'] = ImageFont.truetype(os.path.join(FONTS_DIR, "Jura-Medium.ttf"), 24)
    except Exception:
        default = ImageFont.load_default()
        for k in ['title','heading','body','mono','mono_bold','label','tiny','section']:
            fonts[k] = default
    return fonts

def rr(draw, xy, r, fill=None, outline=None, width=1):
    """Rounded rect."""
    x0,y0,x1,y1 = xy
    if fill:
        draw.rectangle([x0+r,y0,x1-r,y1], fill=fill)
        draw.rectangle([x0,y0+r,x1,y1-r], fill=fill)
        draw.pieslice([x0,y0,x0+2*r,y0+2*r], 180, 270, fill=fill)
        draw.pieslice([x1-2*r,y0,x1,y0+2*r], 270, 360, fill=fill)
        draw.pieslice([x0,y1-2*r,x0+2*r,y1], 90, 180, fill=fill)
        draw.pieslice([x1-2*r,y1-2*r,x1,y1], 0, 90, fill=fill)
    if outline:
        draw.arc([x0,y0,x0+2*r,y0+2*r], 180, 270, fill=outline, width=width)
        draw.arc([x1-2*r,y0,x1,y0+2*r], 270, 360, fill=outline, width=width)
        draw.arc([x0,y1-2*r,x0+2*r,y1], 90, 180, fill=outline, width=width)
        draw.arc([x1-2*r,y1-2*r,x1,y1], 0, 90, fill=outline, width=width)
        draw.line([x0+r,y0,x1-r,y0], fill=outline, width=width)
        draw.line([x0+r,y1,x1-r,y1], fill=outline, width=width)
        draw.line([x0,y0+r,x0,y1-r], fill=outline, width=width)
        draw.line([x1,y0+r,x1,y1-r], fill=outline, width=width)

def arrow(draw, x0, y0, x1, y1, color, w=2):
    draw.line([(x0,y0),(x1,y1)], fill=color, width=w)
    a = math.atan2(y1-y0, x1-x0)
    al = 14
    aa = 0.4
    draw.polygon([(x1,y1),(int(x1-al*math.cos(a-aa)),int(y1-al*math.sin(a-aa))),
                  (int(x1-al*math.cos(a+aa)),int(y1-al*math.sin(a+aa)))], fill=color)

def header(draw, fonts, title, sub):
    draw.line([(60,60),(W-60,60)], fill=PRIMARY_DIM, width=1)
    draw.text((75,78), "SENTINEL", font=fonts['label'], fill=PRIMARY)
    draw.text((215,78), "|", font=fonts['label'], fill=LINE_DIM)
    draw.text((240,78), "PIPELINE ORCHESTRATOR v3.1.0", font=fonts['label'], fill=TEXT_MUTED)
    draw.text((75,110), title, font=fonts['title'], fill=TEXT_WHITE)
    draw.text((75,175), sub, font=fonts['body'], fill=TEXT_DIM)
    draw.line([(75,210),(600,210)], fill=PRIMARY, width=3)
    draw.line([(600,210),(W-75,210)], fill=LINE_DIM, width=1)

def footer(draw, fonts):
    ly = H - 70
    draw.line([(60,ly-15),(W-60,ly-15)], fill=LINE_DIM, width=1)
    draw.text((W-400, ly), "PIPELINE ORCHESTRATOR", font=fonts['label'], fill=TEXT_MUTED)
    draw.text((W-160, ly), "FX STUDIO AI", font=fonts['label'], fill=PRIMARY_DIM)


# ========================================================
# DIAGRAM 1: ARCHITECTURE
# ========================================================
def render_architecture(fonts):
    img = Image.new('RGB', (W, H), BG)
    draw = ImageDraw.Draw(img)
    header(draw, fonts, "ARCHITECTURE", "Three-component execution guardian with single-writer state protocol")

    # --- Controller (top center) ---
    cx, cy = 870, 260
    cw, ch = 500, 120
    rr(draw, (cx, cy, cx+cw, cy+ch), 12, fill=SURFACE, outline=PRIMARY_DIM, width=2)
    draw.text((cx+24, cy+15), "PIPELINE CONTROLLER", font=fonts['heading'], fill=PRIMARY)
    draw.text((cx+24, cy+50), "commands/pipeline.md", font=fonts['mono'], fill=TEXT_DIM)
    draw.text((cx+24, cy+78), "single writer to state file", font=fonts['tiny'], fill=CORRECTED_AMBER)

    # --- State File (center) ---
    sx, sy = 770, 460
    sw, sh = 700, 380
    for i in range(8, 0, -1):
        c = tuple(max(0, v-20*i) for v in PRIMARY[:3])
        rr(draw, (sx-i*3, sy-i*3, sx+sw+i*3, sy+sh+i*3), 14, outline=c, width=1)
    rr(draw, (sx, sy, sx+sw, sy+sh), 12, fill=(20,18,30), outline=PRIMARY, width=2)
    draw.rectangle([sx+1, sy+1, sx+sw-1, sy+52], fill=PRIMARY)
    draw.text((sx+24, sy+12), "sentinel-state.json", font=fonts['mono_bold'], fill=BG)
    draw.text((sx+sw-200, sy+14), "SINGLE WRITER", font=fonts['tiny'], fill=BG)

    fields = [
        ("pipeline_active:", "true", PASS_GREEN),
        ("variant:", '"implement-heavy"', TEXT_DIM),
        ("current_phase:", '"2c"', TEXT_DIM),
        ("expected_next:", '"checkpoint-validator"', PRIMARY_GLOW),
        ("orchestrator_decision:", "{ type, complexity, ... }", TEXT_DIM),
        ("completed_phases:", "[0a, 0b, 0c, 1, 1.5]", TEXT_DIM),
        ("confidence_score:", "0.85", CORRECTED_AMBER),
        ("consecutive_corrections:", "0", PASS_GREEN),
    ]
    for i, (key, val, vc) in enumerate(fields):
        fy = sy + 70 + i * 36
        draw.text((sx+30, fy), key, font=fonts['mono'], fill=TEXT_MUTED)
        draw.text((sx+340, fy), val, font=fonts['mono'], fill=vc)

    # --- Hook (left) ---
    hx, hy = 60, 480
    hw, hh = 600, 340
    rr(draw, (hx, hy, hx+hw, hy+hh), 12, fill=SURFACE, outline=BLOCKED_RED, width=2)
    draw.rectangle([hx+1, hy+1, hx+hw-1, hy+50], fill=BLOCKED_RED)
    draw.text((hx+20, hy+12), "sentinel-hook.cjs", font=fonts['mono_bold'], fill=BG)
    draw.text((hx+hw-220, hy+14), "PreToolUse:Agent", font=fonts['tiny'], fill=BG)

    hook_items = [
        ("Intercepts", "every Agent tool call", TEXT_DIM),
        ("Reads", "sentinel-state.json", PRIMARY_GLOW),
        ("Compares", "target vs expected_next", TEXT_WHITE),
        ("Match", "exit 0 (silent allow)", PASS_GREEN),
        ("Mismatch", "deny + reason to Claude", BLOCKED_RED),
        ("Circuit", "3 corrections -> exit 2", CORRECTED_AMBER),
        ("Scope", "pipeline-orchestrator:* only", TEXT_DIM),
    ]
    for i, (k, v, c) in enumerate(hook_items):
        ly = hy + 68 + i * 36
        draw.text((hx+24, ly), k, font=fonts['mono_bold'], fill=c)
        draw.text((hx+180, ly), v, font=fonts['mono'], fill=TEXT_DIM)

    # --- Agent (right) ---
    ax, ay = 1580, 480
    aw, ah = 600, 340
    rr(draw, (ax, ay, ax+aw, ay+ah), 12, fill=SURFACE, outline=PASS_GREEN, width=2)
    draw.rectangle([ax+1, ay+1, ax+aw-1, ay+50], fill=PASS_GREEN)
    draw.text((ax+20, ay+12), "sentinel.md", font=fonts['mono_bold'], fill=BG)
    draw.text((ax+aw-180, ay+14), "model: sonnet", font=fonts['tiny'], fill=BG)

    agent_items = [
        ("Mode 1", "ORCHESTRATOR_VALIDATION", PRIMARY_GLOW),
        ("Mode 2", "SEQUENCE_VALIDATION", CORRECTED_AMBER),
        ("Mode 3", "COHERENCE_VALIDATION", PASS_GREEN),
        ("Tools", "Read, Glob, Grep (read-only)", TEXT_DIM),
        ("Output", "SENTINEL_VERDICT YAML", TEXT_WHITE),
        ("Emits", "PASS / CORRECTED / BLOCKED", TEXT_DIM),
        ("Isolated", "zero implementation context", BLOCKED_RED),
    ]
    for i, (k, v, c) in enumerate(agent_items):
        ly = ay + 68 + i * 36
        draw.text((ax+20, ly), k, font=fonts['mono_bold'], fill=c)
        draw.text((ax+170, ly), v, font=fonts['mono'], fill=TEXT_DIM)

    # --- Arrows ---
    # Controller -> State (writes)
    arrow(draw, cx+cw//2+50, cy+ch, cx+cw//2+50, sy, PRIMARY, 3)
    draw.text((cx+cw//2+65, cy+ch+15), "writes", font=fonts['label'], fill=PRIMARY)

    # State -> Hook (reads)
    arrow(draw, sx-5, sy+sh//2, hx+hw+5, hy+hh//2, LINE_DIM, 2)
    draw.text((hx+hw+12, hy+hh//2-24), "reads", font=fonts['label'], fill=TEXT_MUTED)

    # State -> Agent (reads)
    arrow(draw, sx+sw+5, sy+sh//2, ax-5, ay+ah//2, LINE_DIM, 2)
    draw.text((ax-60, ay+ah//2-24), "reads", font=fonts['label'], fill=TEXT_MUTED)

    # Controller -> Agent (spawns)
    arrow(draw, cx+cw, cy+ch//2-10, ax+aw//2, ay, PASS_GREEN, 2)
    draw.text((cx+cw+30, cy+8), "spawns at checkpoints", font=fonts['label'], fill=PASS_GREEN)

    # Hook -> Controller (deny feedback)
    arrow(draw, hx+hw//2, hy, cx-5, cy+ch, BLOCKED_RED, 2)
    draw.text((hx+hw//2-120, hy-24), "deny reason -> Claude", font=fonts['label'], fill=BLOCKED_RED)

    # Legend
    footer(draw, fonts)
    ly = H - 70
    items = [(PRIMARY,"writes"),(LINE_DIM,"reads"),(PASS_GREEN,"spawns"),(BLOCKED_RED,"deny feedback")]
    lx = 80
    for color, label in items:
        draw.line([(lx,ly+10),(lx+40,ly+10)], fill=color, width=3)
        draw.text((lx+50, ly+2), label, font=fonts['label'], fill=TEXT_DIM)
        lx += 210

    img.save(os.path.join(OUT_DIR, "sentinel-architecture.png"), "PNG")
    print("Saved: sentinel-architecture.png")


# ========================================================
# DIAGRAM 2: EXECUTION FLOW
# ========================================================
def render_flow(fonts):
    img = Image.new('RGB', (W, H), BG)
    draw = ImageDraw.Draw(img)
    header(draw, fonts, "EXECUTION FLOW", "Sentinel checkpoints intercept at critical junctions across all pipeline phases")

    def phase_box(x, y, pid, line1, line2, color, conditional=False):
        bw, bh = 145, 90
        bc = LINE_DIM if conditional else color
        fc = (20,20,28) if conditional else SURFACE
        rr(draw, (x,y,x+bw,y+bh), 8, fill=fc, outline=bc, width=2)
        draw.text((x+10, y+8), pid, font=fonts['mono_bold'], fill=color)
        draw.text((x+10, y+35), line1, font=fonts['tiny'], fill=TEXT_DIM)
        draw.text((x+10, y+55), line2, font=fonts['tiny'], fill=TEXT_DIM)
        if conditional:
            draw.text((x+10, y+bh+6), "conditional", font=fonts['tiny'], fill=TEXT_MUTED)
        return x+bw

    def sentinel_diamond(x, y, line1, line2, size=45):
        pts = [(x,y-size),(x+size+15,y),(x,y+size),(x-size-15,y)]
        draw.polygon(pts, fill=(30,25,15), outline=CORRECTED_AMBER, width=2)
        draw.text((x-38, y-14), line1, font=fonts['tiny'], fill=CORRECTED_AMBER)
        draw.text((x-32, y+4), line2, font=fonts['tiny'], fill=TEXT_DIM)

    def h_arrow(x0, x1, y):
        draw.line([(x0+4,y),(x1-4,y)], fill=LINE_DIM, width=2)
        draw.polygon([(x1-2,y),(x1-10,y-5),(x1-10,y+5)], fill=LINE_DIM)

    # Row 1: Phase 0 + 1
    r1 = 290
    draw.text((75, r1-15), "PHASE 0 + 1", font=fonts['section'], fill=TEXT_MUTED)

    positions = []
    x = 80
    # 0a
    e = phase_box(x, r1+20, "0a", "task-", "orchestrator", PRIMARY); positions.append((x,e)); x = e+25
    # S1
    sx1 = x+70; sentinel_diamond(sx1, r1+65, "SENTINEL", "#1 ORCH"); x = sx1+80
    # 0b
    e = phase_box(x, r1+20, "0b", "information-", "gate", PRIMARY); x = e+25
    # 0c
    e = phase_box(x, r1+20, "0c", "design-", "interrogator", PRIMARY_DIM, True); x = e+25
    # S2
    sx2 = x+70; sentinel_diamond(sx2, r1+65, "SENTINEL", "#2 COH"); x = sx2+80
    # 1
    e = phase_box(x, r1+20, "1", "PROPOSAL", "confirm", (80,80,100)); x = e+25
    # 1.5
    e = phase_box(x, r1+20, "1.5", "plan-", "architect", PRIMARY_DIM, True); x = e+25
    # S3
    sx3 = x+70; sentinel_diamond(sx3, r1+65, "SENTINEL", "#3 COH")

    # Connecting arrows row 1
    segs = [225, 295, 445, 590, 660, 810, 960, 1105, 1175, 1325, 1470, 1615, 1685, 1835]
    for i in range(0, len(segs)-1, 2):
        h_arrow(segs[i], segs[i+1], r1+65)

    # Row 2: Phase 2
    r2 = 530
    draw.text((75, r2-15), "PHASE 2", font=fonts['section'], fill=TEXT_MUTED)
    draw.text((230, r2-15), "BATCH EXECUTION", font=fonts['tiny'], fill=TEXT_MUTED)

    # Batch bracket
    draw.rectangle([170, r2+15, 1450, r2+140], outline=LINE_DIM, width=1)
    draw.text((178, r2+2), "per batch", font=fonts['tiny'], fill=TEXT_MUTED)

    x2 = 190
    e = phase_box(x2, r2+30, "2", "EXECUTOR", "batches", PRIMARY); x2 = e+30
    # Hook guard
    rr(draw, (x2, r2+30, x2+200, r2+120), 6, fill=(25,15,15), outline=BLOCKED_RED, width=2)
    draw.text((x2+14, r2+40), "SENTINEL", font=fonts['tiny'], fill=BLOCKED_RED)
    draw.text((x2+14, r2+60), "hook guard", font=fonts['tiny'], fill=TEXT_DIM)
    draw.text((x2+14, r2+82), "every spawn", font=fonts['tiny'], fill=TEXT_MUTED)
    x2 += 230
    e = phase_box(x2, r2+30, "ckpt", "checkpoint", "validator", (80,80,100)); x2 = e+30
    e = phase_box(x2, r2+30, "rev", "review-", "orchestrator", PRIMARY); x2 = e+50

    # S4
    sx4 = x2+80; sentinel_diamond(sx4, r2+75, "SENTINEL", "#4 COH")
    draw.text((sx4-60, r2+128), "COMPLEXA mandatory", font=fonts['tiny'], fill=TEXT_MUTED)

    # Arrows row 2
    h_arrow(335, 375, r2+75)
    h_arrow(575, 620, r2+75)
    h_arrow(820, 855, r2+75)
    h_arrow(1000, 1050, r2+75)
    h_arrow(1195, 1350, r2+75)

    # Row 3: Phase 3
    r3 = 770
    draw.text((75, r3-15), "PHASE 3", font=fonts['section'], fill=TEXT_MUTED)
    draw.text((230, r3-15), "CLOSURE", font=fonts['tiny'], fill=TEXT_MUTED)

    x3 = 120
    e = phase_box(x3, r3+20, "3a", "sanity-", "checker", (80,80,100)); x3 = e+50
    e = phase_box(x3, r3+20, "3b", "final-", "adversarial", PRIMARY); x3 = e+50
    e = phase_box(x3, r3+20, "val", "final-", "validator", PRIMARY); x3 = e+50

    sx5 = x3+100; sentinel_diamond(sx5, r3+65, "SENTINEL", "#5 COH")
    draw.text((sx5-60, r3+118), "COMPLEXA mandatory", font=fonts['tiny'], fill=TEXT_MUTED)

    x3 = sx5+140
    e = phase_box(x3, r3+20, "3c", "finishing-", "branch", PASS_GREEN)

    # Arrows row 3
    h_arrow(265, 370, r3+65)
    h_arrow(515, 620, r3+65)
    h_arrow(765, 870, r3+65)
    h_arrow(910, 1070, r3+65)
    h_arrow(1200, 1320, r3+65)

    # Vertical connectors
    draw.line([(1900, r1+115), (1900, r2+30)], fill=LINE_DIM, width=2)
    draw.polygon([(1900,r2+30),(1895,r2+18),(1905,r2+18)], fill=LINE_DIM)
    draw.line([(1450, r2+140), (1450, r3+25)], fill=LINE_DIM, width=2)
    draw.polygon([(1450,r3+25),(1445,r3+13),(1455,r3+13)], fill=LINE_DIM)

    # Legend
    footer(draw, fonts)
    ly = H-70
    legend = [(PRIMARY,"Pipeline Agent"),(CORRECTED_AMBER,"Sentinel Checkpoint"),(BLOCKED_RED,"Hook Guard"),(LINE_DIM,"Conditional")]
    lx = 80
    for color, label in legend:
        rr(draw, (lx,ly+2,lx+30,ly+18), 4, outline=color, width=2)
        draw.text((lx+40, ly), label, font=fonts['label'], fill=TEXT_DIM)
        lx += 280

    img.save(os.path.join(OUT_DIR, "sentinel-flow.png"), "PNG")
    print("Saved: sentinel-flow.png")


# ========================================================
# DIAGRAM 3: VALIDATION MODES
# ========================================================
def render_modes(fonts):
    img = Image.new('RGB', (W, H), BG)
    draw = ImageDraw.Draw(img)
    header(draw, fonts, "VALIDATION MODES", "Three specialized modes — each triggered by a different pipeline event")

    modes = [
        {"name": "ORCHESTRATOR\nVALIDATION", "color": PRIMARY_GLOW,
         "trigger": "After Phase 0a", "detail": "task-orchestrator returns",
         "checks": ["Routing matrix correctness", "Elevation rules respected",
                     "SSOT conflict detection", "Field completeness"],
         "x": 75},
        {"name": "SEQUENCE\nVALIDATION", "color": CORRECTED_AMBER,
         "trigger": "After hook deny", "detail": "divergence detected",
         "checks": ["Phase ordering vs SSOT", "Mandatory phases complete",
                     "Conditional phase evaluation", "Agent name resolution"],
         "x": 835},
        {"name": "COHERENCE\nVALIDATION", "color": PASS_GREEN,
         "trigger": "Phase transitions", "detail": "0->1, 1->2, 2->3, post-PdC",
         "checks": ["Cross-gate consistency", "Output chain integrity",
                     "Confidence drift (>0.3)", "Gate hardness tampering"],
         "x": 1595},
    ]

    for m in modes:
        mx = m["x"]
        my = 260
        mw = 680
        mh = 530

        rr(draw, (mx, my, mx+mw, my+mh), 14, fill=SURFACE, outline=m["color"], width=2)
        # Header
        draw.rectangle([mx+1, my+1, mx+mw-1, my+78], fill=m["color"])
        lines = m["name"].split("\n")
        draw.text((mx+28, my+8), lines[0], font=fonts['heading'], fill=BG)
        draw.text((mx+28, my+40), lines[1], font=fonts['heading'], fill=BG)

        # Trigger
        draw.text((mx+28, my+100), "TRIGGER", font=fonts['label'], fill=m["color"])
        draw.text((mx+28, my+125), m["trigger"], font=fonts['mono_bold'], fill=TEXT_WHITE)
        draw.text((mx+28, my+152), m["detail"], font=fonts['mono'], fill=TEXT_DIM)

        draw.line([(mx+28, my+185), (mx+mw-28, my+185)], fill=LINE_DIM, width=1)

        # Checks
        draw.text((mx+28, my+200), "VALIDATES", font=fonts['label'], fill=m["color"])
        for i, check in enumerate(m["checks"]):
            cy = my + 232 + i * 38
            draw.ellipse([mx+32, cy+6, mx+44, cy+18], fill=m["color"])
            draw.text((mx+56, cy), check, font=fonts['body'], fill=TEXT_WHITE)

        draw.line([(mx+28, my+395), (mx+mw-28, my+395)], fill=LINE_DIM, width=1)

        # Outcomes
        draw.text((mx+28, my+410), "OUTCOMES", font=fonts['label'], fill=m["color"])
        outcomes = [
            ("PASS", PASS_GREEN, "All checks valid"),
            ("CORRECTED", CORRECTED_AMBER, "Auto-fixed, continue"),
            ("BLOCKED", BLOCKED_RED, "Pipeline stopped"),
        ]
        for i, (status, color, desc) in enumerate(outcomes):
            oy = my + 442 + i * 32
            rr(draw, (mx+28, oy, mx+155, oy+26), 5, fill=color)
            draw.text((mx+38, oy+3), status, font=fonts['tiny'], fill=BG)
            draw.text((mx+168, oy+3), desc, font=fonts['mono'], fill=TEXT_DIM)

    # Connecting arrows between modes
    draw.line([(755, 560), (835, 560)], fill=LINE_DIM, width=2)
    draw.text((760, 538), "if divergence", font=fonts['tiny'], fill=TEXT_MUTED)
    draw.line([(755, 620), (1595, 620)], fill=LINE_DIM, width=2)
    draw.text((1100, 598), "at phase boundaries", font=fonts['tiny'], fill=TEXT_MUTED)

    # Complexity matrix at bottom
    by = 850
    draw.line([(75, by), (W-75, by)], fill=LINE_DIM, width=1)
    draw.text((75, by+15), "CHECKPOINTS BY COMPLEXITY", font=fonts['section'], fill=TEXT_MUTED)

    headers = ["Checkpoint", "MEDIA", "COMPLEXA"]
    col_x = [100, 750, 1100]
    for i, h in enumerate(headers):
        draw.text((col_x[i], by+55), h, font=fonts['mono_bold'], fill=TEXT_WHITE)

    rows = [
        ("#1 post_orchestrator", "MANDATORY", "MANDATORY"),
        ("#2 phase_0_to_1", "recommended", "MANDATORY"),
        ("#3 phase_1_to_2", "recommended", "MANDATORY"),
        ("#4 phase_2_to_3", "recommended", "MANDATORY"),
        ("#5 post_final_validator", "recommended", "MANDATORY"),
    ]
    for i, (name, media, complexa) in enumerate(rows):
        ry = by + 90 + i * 34
        draw.text((col_x[0], ry), name, font=fonts['mono'], fill=TEXT_DIM)
        mc = PASS_GREEN if media == "MANDATORY" else TEXT_MUTED
        cc = PASS_GREEN
        draw.text((col_x[1], ry), media, font=fonts['mono'], fill=mc)
        draw.text((col_x[2], ry), complexa, font=fonts['mono_bold'], fill=cc)

    footer(draw, fonts)
    img.save(os.path.join(OUT_DIR, "sentinel-modes.png"), "PNG")
    print("Saved: sentinel-modes.png")


if __name__ == "__main__":
    fonts = load_fonts()
    print("Rendering sentinel diagrams (2400x1350, large fonts)...")
    render_architecture(fonts)
    render_flow(fonts)
    render_modes(fonts)
    print("Done.")
