"""
PolicyForge CLI demo — animated SVG.

Self-contained, loops forever, uses SMIL <set> animations for portability.
Each line of the script gets exactly one visual row. Typed text animates
character-by-character; everything else fades in instantly.
"""
from pathlib import Path

# Each item is one VISIBLE line. Tuple shape:
#   ("type", text)               — typed character-by-character
#   ("out", text, color_key)     — appears all at once
#   ("muted", text)              — italic comment
#   ("prompt", prompt, answer)   — prompt is teal, answer is typed
#   ("blank",)                   — empty line
LINES = [
    (0.0,  ("type",   "$ npx policyforge wizard")),
    (0.6,  ("out",    "", "fg")),
    (0.0,  ("out",    "PolicyForge — interactive setup", "fg")),
    (0.4,  ("blank",)),
    (0.3,  ("muted",  "Step 1 of 4 — Policy")),
    (0.4,  ("prompt", "? Path to your policy document: ", "./examples/sample-policy.md")),
    (0.7,  ("out",    "  ✓ Found: 4.2 KB markdown · Acme Corp AI Policy v2", "ok")),
    (0.4,  ("blank",)),
    (0.3,  ("muted",  "Step 2 of 4 — Your stack")),
    (0.4,  ("prompt", "? Primary language: ", "TypeScript")),
    (0.5,  ("prompt", "? CI system: ", "GitHub Actions")),
    (0.5,  ("prompt", "? Secret store: ", "GitHub Secrets")),
    (0.4,  ("blank",)),
    (0.3,  ("muted",  "Step 3 of 4 — Review")),
    (0.3,  ("out",    "  Loading baseline... done (16 rules)", "fg")),
    (0.15, ("out",    "  Running review...  done", "fg")),
    (0.4,  ("blank",)),
    (0.2,  ("severity", "  Critical  ", "██▓░░░░░", "  2/6 satisfied  · 3 gaps", "crit")),
    (0.15, ("severity", "  High      ", "██░░░░░░", "  2/8 satisfied  · 6 gaps", "warn")),
    (0.15, ("severity", "  Medium    ", "░░░░░░░░", "  0/2 satisfied  · 2 gaps", "warn")),
    (0.4,  ("blank",)),
    (0.3,  ("split",  "  Recommendation: ", "fg", "material revision required", "crit")),
    (0.4,  ("blank",)),
    (0.3,  ("muted",  "Step 4 of 4 — Generate toolkit")),
    (0.4,  ("prompt", "? Generate enforcement toolkit now? ", "Yes")),
    (0.5,  ("blank",)),
    (0.2,  ("out",    "  ✓ Writing AGENTS.md", "ok")),
    (0.18, ("out",    "  ✓ Writing CLAUDE.md (redirector)", "ok")),
    (0.18, ("out",    "  ✓ Writing .github/copilot-instructions.md", "ok")),
    (0.18, ("out",    "  ✓ Writing scripts/ai-content-guard.js", "ok")),
    (0.18, ("out",    "  ✓ Writing .gitleaks.toml", "ok")),
    (0.18, ("out",    "  ✓ Writing .husky/pre-commit", "ok")),
    (0.18, ("out",    "  ✓ Writing .github/workflows/ai-policy-gates.yml", "ok")),
    (0.18, ("out",    "  ✓ Writing docs/AI_INCIDENT_RUNBOOK.md", "ok")),
    (0.18, ("out",    "  ✓ Writing review.md", "ok")),
    (0.18, ("out",    "  ✓ Writing review.json", "ok")),
    (0.4,  ("blank",)),
    (0.3,  ("out",    "  10 files written to ./policyforge-output/", "muted")),
    (0.5,  ("blank",)),
    (0.4,  ("out",    "Done — your toolkit is ready to commit.", "ok-bold")),
    (0.5,  ("blank",)),
    (0.3,  ("type",   "$ ")),
]

COLORS = {
    "bg":      "#1a1a1a",
    "barbg":   "#2a2a2a",
    "fg":      "#e8e8e8",
    "muted":   "#888888",
    "comment": "#6b8e8e",
    "prompt":  "#2d8585",
    "input":   "#f4ecd8",
    "ok":      "#7fc080",
    "warn":    "#e8b665",
    "crit":    "#d97757",
    "dotgray": "#444444",
}

LINE_HEIGHT  = 18
CHAR_WIDTH   = 7.6
FONT_SIZE    = 13
PADDING_X    = 18
BAR_HEIGHT   = 26
PADDING_TOP  = BAR_HEIGHT + 14
WIDTH        = 580
TYPING_SPEED = 0.045

# We render every line into the document. Total lines determines SVG height,
# but we use a fixed visible window and animate translateY to scroll.
VISIBLE_LINES = 22
HEIGHT = PADDING_TOP + VISIBLE_LINES * LINE_HEIGHT + 18

def esc(s):
    out = (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            .replace('"', "&quot;"))
    # Replace non-ASCII with numeric entities for portable rendering
    return "".join(c if ord(c) < 128 else f"&#x{ord(c):X};" for c in out)

# Build the events
events = []   # each: { start, line, x_chars, text, color, italic?, bold? }
t = 0.0
visual_line = 0  # one row per LINES entry — no overlapping

for delay, line in LINES:
    t += delay
    kind = line[0]

    if kind == "type":
        full = line[1]
        for ci, ch in enumerate(full):
            color = COLORS["prompt"] if (ci < 2 and ch in "$ ") else COLORS["input"]
            events.append({
                "start": t + ci * TYPING_SPEED,
                "line":  visual_line,
                "x":     ci,
                "text":  ch,
                "color": color,
            })
        t += len(full) * TYPING_SPEED

    elif kind == "out":
        text, color_key = line[1], line[2]
        color = COLORS.get(color_key, COLORS["fg"])
        bold  = color_key == "ok-bold"
        if bold:
            color = COLORS["ok"]
        events.append({
            "start": t, "line": visual_line, "x": 0,
            "text":  text, "color": color, "bold": bold,
        })
        t += 0.05

    elif kind == "muted":
        events.append({
            "start": t, "line": visual_line, "x": 0,
            "text":  line[1], "color": COLORS["comment"], "italic": True,
        })
        t += 0.06

    elif kind == "prompt":
        prompt_text, answer = line[1], line[2]
        events.append({
            "start": t, "line": visual_line, "x": 0,
            "text":  prompt_text, "color": COLORS["prompt"],
        })
        t += 0.2  # small pause before the answer types
        for ci, ch in enumerate(answer):
            events.append({
                "start": t + ci * TYPING_SPEED,
                "line":  visual_line,
                "x":     len(prompt_text) + ci,
                "text":  ch,
                "color": COLORS["input"],
            })
        t += len(answer) * TYPING_SPEED

    elif kind == "severity":
        # severity: ("severity", "  Critical  ", "██▓░░░░░", "  2/6 satisfied  · 3 gaps", color_key)
        label, bar, summary, color_key = line[1], line[2], line[3], line[4]
        events.append({
            "start": t, "line": visual_line, "x": 0,
            "text":  label, "color": COLORS["fg"],
        })
        events.append({
            "start": t + 0.03, "line": visual_line, "x": len(label),
            "text":  bar, "color": COLORS[color_key],
        })
        events.append({
            "start": t + 0.06, "line": visual_line, "x": len(label) + len(bar),
            "text":  summary, "color": COLORS["fg"],
        })
        t += 0.05

    elif kind == "split":
        # split: ("split", first_text, first_color_key, second_text, second_color_key)
        first, fc, second, sc = line[1], line[2], line[3], line[4]
        events.append({
            "start": t, "line": visual_line, "x": 0,
            "text":  first, "color": COLORS[fc],
        })
        events.append({
            "start": t + 0.05, "line": visual_line, "x": len(first),
            "text":  second, "color": COLORS[sc], "bold": True,
        })
        t += 0.05

    elif kind == "blank":
        # No event, but visual_line still increments
        pass

    visual_line += 1

TOTAL_DURATION = t + 1.0

# Scroll: pan when content exceeds visible area
SCROLL_AT = VISIBLE_LINES - 4   # start scrolling 4 lines before bottom
content_lines = visual_line
if content_lines > SCROLL_AT:
    scroll_lines = content_lines - SCROLL_AT
    SCROLL_PX = scroll_lines * LINE_HEIGHT
    scroll_events = [e for e in events if e["line"] >= SCROLL_AT]
    scroll_start = min(e["start"] for e in scroll_events) if scroll_events else TOTAL_DURATION
    scroll_dur = max(0.5, (TOTAL_DURATION - scroll_start) * 0.85)
else:
    SCROLL_PX = 0
    scroll_start = TOTAL_DURATION
    scroll_dur = 0.5

# === Build SVG ===
parts = []
parts.append(f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {WIDTH} {HEIGHT}" width="{WIDTH}" height="{HEIGHT}" font-family="'IBM Plex Mono', Consolas, 'Courier New', monospace" font-size="{FONT_SIZE}">
  <title>PolicyForge CLI demo &#x2014; wizard flow</title>
  <desc>Animated terminal recording of the policyforge wizard.</desc>

  <!-- Clip the visible terminal window so scrolled content stays inside -->
  <defs>
    <clipPath id="window">
      <rect x="0" y="{BAR_HEIGHT}" width="{WIDTH}" height="{HEIGHT - BAR_HEIGHT}"/>
    </clipPath>
  </defs>

  <!-- Background -->
  <rect width="{WIDTH}" height="{HEIGHT}" fill="{COLORS["bg"]}"/>

  <!-- Title bar -->
  <rect x="0" y="0" width="{WIDTH}" height="{BAR_HEIGHT}" fill="{COLORS["barbg"]}"/>
  <line x1="0" y1="{BAR_HEIGHT}" x2="{WIDTH}" y2="{BAR_HEIGHT}" stroke="{COLORS["bg"]}" stroke-width="1"/>
  <circle cx="18" cy="15" r="5" fill="{COLORS["dotgray"]}"/>
  <circle cx="36" cy="15" r="5" fill="{COLORS["dotgray"]}"/>
  <circle cx="54" cy="15" r="5" fill="{COLORS["dotgray"]}"/>
  <text x="{WIDTH - 18}" y="19" fill="{COLORS["muted"]}" font-size="11" text-anchor="end">policyforge &#x2014; wizard</text>

  <!-- Scrollable content -->
  <g clip-path="url(#window)">
    <g>
      <animateTransform attributeName="transform" attributeType="XML" type="translate"
        from="0 0" to="0 -{SCROLL_PX}"
        begin="{scroll_start:.2f}s" dur="{scroll_dur:.2f}s" fill="freeze"
        calcMode="spline" keyTimes="0;1" keySplines="0.4 0 0.2 1"/>''')

for e in events:
    x = PADDING_X + e["x"] * CHAR_WIDTH
    y = PADDING_TOP + e["line"] * LINE_HEIGHT + 14
    weight = ' font-weight="600"' if e.get("bold") else ''
    style  = ' font-style="italic"' if e.get("italic") else ''
    text   = esc(e["text"]) if e["text"] != " " else "&#160;"
    parts.append(
        f'      <text x="{x:.1f}" y="{y}" fill="{e["color"]}"{weight}{style} opacity="0">'
        f'{text}'
        f'<set attributeName="opacity" to="1" begin="{e["start"]:.2f}s"/>'
        f'</text>'
    )

parts.append('    </g>')
parts.append('  </g>')

# Cursor at the final $ prompt
final_cursor_x = PADDING_X + 2 * CHAR_WIDTH
final_cursor_y_doc = PADDING_TOP + (visual_line - 1) * LINE_HEIGHT
final_cursor_y_visible = final_cursor_y_doc - SCROLL_PX

parts.append(f'''
  <!-- Blinking cursor at final prompt -->
  <rect x="{final_cursor_x:.1f}" y="{final_cursor_y_visible}" width="9" height="16" fill="{COLORS["input"]}" opacity="0">
    <set attributeName="opacity" to="1" begin="{TOTAL_DURATION - 0.3:.2f}s"/>
    <animate attributeName="opacity" values="1;0;1" dur="1.0s" begin="{TOTAL_DURATION - 0.3:.2f}s" repeatCount="indefinite"/>
  </rect>
</svg>''')

svg = "\n".join(parts)
out = Path("/home/claude/work/policyforge/site/demo.svg")
out.write_text(svg, encoding="utf-8")

print(f"Wrote {out}")
print(f"  Total visual lines: {visual_line}")
print(f"  Total events: {len(events)}")
print(f"  Duration: {TOTAL_DURATION:.1f}s")
print(f"  Scroll: {SCROLL_PX}px starting at {scroll_start:.1f}s over {scroll_dur:.1f}s")
print(f"  SVG size: {len(svg)} bytes")
print(f"  Visible window: {VISIBLE_LINES} lines × {LINE_HEIGHT}px = {VISIBLE_LINES * LINE_HEIGHT}px")
print(f"  Total dimensions: {WIDTH} × {HEIGHT}")
