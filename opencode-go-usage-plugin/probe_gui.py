import json, time
from playwright.sync_api import sync_playwright

url = "http://127.0.0.1:3080"
out = {}
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1500, "height": 950})
    logs = []
    page.on("pageerror", lambda e: logs.append("PAGEERROR: " + str(e)))
    page.on("console", lambda m: logs.append("["+m.type+"] "+m.text))
    page.goto(url, wait_until="load", timeout=30000)
    page.wait_for_timeout(5000)

    # click the '进行中' session to open a conversation header
    rows = page.query_selector_all("div.YDXeBa_sessionRow")
    for r in rows:
        t = (r.text_content() or '').strip()
        if '进行中' in t or '初始化Git' in t:
            try: r.click(timeout=2000); break
            except Exception: pass
    page.wait_for_timeout(5000)

    # Dump header utilities region html
    html = page.evaluate("""() => {
      const out = [];
      const els = document.querySelectorAll('[data-slot="conversation.session.header.utilities"]');
      for (const el of els) out.push(el.parentElement ? el.parentElement.outerHTML.slice(0, 2500) : el.outerHTML.slice(0,2500));
      return out;
    }""")
    out['header_utils_html'] = html

    # precise badge: any button with title OpenCode
    btn = page.evaluate("""() => {
      const out = [];
      for (const el of document.querySelectorAll('button')) {
        const title = (el.getAttribute('title')||'');
        if (title.includes('OpenCode')) out.push({title: title.slice(0,60), text: (el.textContent||'').trim(), visible: !!(el.offsetWidth || el.offsetHeight)});
      }
      return out;
    }""")
    out['badge_buttons'] = btn

    out['logs'] = logs[-50:]
    with open("probe4_out.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print("header_utils:", len(html), "badge_buttons:", len(btn))
    print("--- ocgq logs ---")
    for l in logs:
        if 'ocgq' in l or 'Error' in l or 'error' in l:
            print(l)
    browser.close()
