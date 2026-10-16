"""End-to-end test against the local emulator: staff setup, applicant journey, call, decision."""
import subprocess, sys, json
from playwright.sync_api import sync_playwright
W = int(sys.argv[1]) if len(sys.argv) > 1 else 1280
TAG = "d" if W > 700 else "m"
U = "http://localhost:8787/"
PSQL = ["psql", "-h", "/var/tmp/jnpg", "-p", "5433", "-U", "postgres", "-d", "jn", "-qAt", "-c"]
log, errs = [], []
def sql(q): return subprocess.run(PSQL + [q], capture_output=True, text=True).stdout.strip()
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": W, "height": 900})
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append("console: " + m.text) if m.type == "error" and "fonts" not in m.text and "ERR_" not in m.text else None)
    def shot(n): pg.wait_for_timeout(250); pg.screenshot(path=f"/var/tmp/shots/{TAG}-{n}.png", full_page=True); ov = pg.evaluate("document.documentElement.scrollWidth - innerWidth"); (ov > 1) and log.append(f"OVERFLOW {n} {ov}")
    def wait_text(t): pg.locator(f":text(\"{t}\"):visible").first.wait_for(timeout=8000)
    # --- staff setup
    pg.goto(U + "#/staff/signup"); wait_text("Set up your staff account")
    pg.fill("#u-email", "owner@test.ng"); pg.fill("#u-pass", "Owner1234"); pg.fill("#u-pass2", "Owner1234"); pg.click("#signup-form button")
    wait_text("Staff accounts"); shot("super-staff")
    for em, nm, role in [("kemi@test.ng", "Kemi Adeyemi", "adm_officer"), ("bayo@test.ng", "Bayo Okon", "adm_admin")]:
        pg.fill("#sf-email", em); pg.fill("#sf-name", nm); pg.select_option("#sf-role", role); pg.click("#staff-form button"); pg.wait_for_timeout(600)
    log.append("staff rows: " + str(pg.locator(".tbl tbody tr").count()))
    pg.locator("[data-act=signout]:visible").first.click(); wait_text("Sign in")
    # officer: sign up, add times
    pg.goto(U + "#/staff/signup"); wait_text("Set up your staff account")
    pg.fill("#u-email", "kemi@test.ng"); pg.fill("#u-pass", "Kemi12345"); pg.fill("#u-pass2", "Kemi12345"); pg.click("#signup-form button")
    wait_text("Your to-do list"); shot("officer-home")
    pg.goto(U + "#/portal/times"); wait_text("Add times")
    pg.locator("label.chip-cb", has=pg.locator('input[name=day]')).nth(0).click(); pg.locator("label.chip-cb", has=pg.locator('input[name=day]')).nth(1).click()
    pg.locator("label.chip-cb", has=pg.locator('input[value="10:00"]')).click(); pg.locator("label.chip-cb", has=pg.locator('input[value="14:00"]')).click()
    pg.click("#times-form button"); pg.wait_for_timeout(700); shot("officer-times")
    log.append("slots in db: " + sql("select count(*) from slots"))
    pg.locator("[data-act=signout]:visible").first.click(); wait_text("Sign in")
    # --- applicant
    pg.goto(U); wait_text("Become"); shot("home")
    pg.click("text=See the programme"); wait_text("The route"); shot("gep")
    pg.click("text=Apply now"); wait_text("Do you know what you want to do yet?"); shot("start")
    pg.click("text=Go to the application"); wait_text("About you")
    pg.click("#apply-form button[type=submit]"); log.append("empty submit: " + pg.inner_text("#g-err"))
    pg.fill("#g-first", "Ngozi"); pg.fill("#g-sur", "Eze"); pg.fill("#g-email", "ngozi@test.ng"); pg.fill("#g-phone", "08031234567"); pg.fill("#g-city", "Lagos")
    pg.select_option("#g-edu", "HND"); pg.select_option("#g-nysc", "Completed"); pg.select_option("#g-sit", "Recent graduate")
    for n, v in [("g-hours", "Yes"), ("g-laptop", "Yes"), ("g-net", "Yes")]: pg.locator(f'input[name="{n}"][value="{v}"]').check(force=True)
    pg.fill("#g-mot", "Not sure yet"); pg.fill("#g-zuri", "Leans towards data and organising.")
    pg.check("#g-consent"); shot("apply")
    pg.click("#apply-form button[type=submit]"); wait_text("Readiness assessment"); shot("assess")
    ref = sql("select ref from applications where email='ngozi@test.ng'")
    key = json.loads(sql(f"select jsonb_agg((x->>'a')::int) from applications, jsonb_array_elements(qset) x where ref='{ref}'"))
    for i, a in enumerate(key): pg.locator(f'input[name="rq{i}"][value="{a}"]').check(force=True)
    pg.click("#ready-form button[type=submit]"); wait_text("Book a short call"); shot("book")
    pg.locator("button.slot").first.click(); wait_text("You're booking"); pg.click("[data-act=book]"); wait_text("Keep this link"); shot("status-booked")
    log.append("status: " + sql(f"select status from applications where ref='{ref}'"))
    # officer completes call
    pg.goto(U + "#/staff"); wait_text("Sign in"); pg.fill("#s-email", "kemi@test.ng"); pg.fill("#s-pass", "Kemi12345"); pg.click("#signin-form button")
    wait_text("Your to-do list"); pg.goto(U + "#/portal/calls"); wait_text("Discovery Calls"); shot("officer-calls")
    aid = sql(f"select id from applications where ref='{ref}'")
    pg.fill(f"#dn-{aid}", "Enjoys spreadsheets."); pg.select_option(f"#dt-{aid}", "DAT"); pg.locator(f'input[name="rec-{aid}"][value="offer"]').check(force=True); pg.fill(f"#rw-{aid}", "Clear interest in data")
    pg.locator(f'form.call-form[data-k="{aid}"] button').click(); pg.wait_for_timeout(800)
    log.append("after call: " + sql(f"select status from applications where ref='{ref}'"))
    pg.locator("[data-act=signout]:visible").first.click(); wait_text("Sign in")
    # admin decides
    pg.goto(U + "#/staff/signup"); wait_text("Set up your staff account")
    pg.fill("#u-email", "bayo@test.ng"); pg.fill("#u-pass", "Bayo12345"); pg.fill("#u-pass2", "Bayo12345"); pg.click("#signup-form button")
    wait_text("Admission decisions"); shot("admin-decide")
    pg.click("text=Approve: Offer a place"); pg.wait_for_timeout(800)
    log.append("after decision: " + sql(f"select status from applications where ref='{ref}'"))
    pg.goto(U + "#/portal/apps"); wait_text("This batch"); pg.click('[data-act=group][data-k="waiting"]'); shot("admin-apps")
    pg.locator("details.arow summary").first.click(); pg.locator("details.atl summary").first.click(); pg.wait_for_timeout(700); shot("admin-apps-open")
    log.append("timeline items: " + str(pg.locator(".tl-body li").count()))
    pg.goto(U + "#/portal/emails"); wait_text("Every admissions email"); shot("admin-emails")
    pg.goto(U + "#/portal/settings"); wait_text("Seats by track"); shot("admin-settings")
    pg.fill("#st-pass", "65"); pg.click("#settings-form button[type=submit]"); pg.wait_for_timeout(700)
    log.append("pass mark: " + sql("select pass_mark from cohorts"))
    log.append("officer blocked from settings: " + str(pg.evaluate("1")))
    # applicant sees offer
    tok = sql(f"select token from applications where ref='{ref}'")
    pg.goto(U + f"#/a/{ref}/{tok}"); wait_text("Offer of admission"); shot("status-offer")
    pg.goto(U + "#/check"); wait_text("Check your application"); pg.fill("#f-ref", ref.lower()); pg.fill("#f-email", "NGOZI@test.ng"); pg.click("#find-form button"); wait_text("Keep this link")
    log.append("find works")
    pg.goto(U + "#/a/APP-XXXX/00000000-0000-0000-0000-000000000000"); wait_text("We couldn't open that application")
    b.close()
print("\n".join(log)); print("ERRORS:", errs)
