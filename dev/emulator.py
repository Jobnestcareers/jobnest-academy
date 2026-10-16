"""Local stand-in for Supabase (database functions + sign-in), for testing the app
without internet. Serves public/ and answers /rest/v1/rpc/* and /auth/v1/* by
calling the real SQL functions in a local Postgres. Not used in production."""
import base64, json, subprocess, sys, time, urllib.parse, pathlib, http.client
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

ROOT = pathlib.Path(__file__).resolve().parent.parent / "public"
PSQL = ["psql", "-h", "/var/tmp/jnpg", "-p", "5433", "-U", "postgres", "-d", "jn", "-qAt", "-v", "ON_ERROR_STOP=1"]
USERS = {}  # email -> password
IDS = {}  # admin-created user id -> email
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8787

def lit(v):
    return "NULL" if v is None else "'" + str(v).replace("'", "''") + "'"

def argtypes(fn):
    out = subprocess.run(PSQL + ["-c", f"select coalesce(array_to_string(proargnames, ','), ''), pg_get_function_identity_arguments(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname={lit(fn)}"], capture_output=True, text=True).stdout.strip()
    if not out: return None
    names, ident = out.split("|", 1)
    types = {}
    for part in [x.strip() for x in ident.split(",") if x.strip()]:
        nm, ty = part.split(" ", 1)
        types[nm] = ty
    return types

def token_for(email):
    return "u." + base64.urlsafe_b64encode(json.dumps({"email": email, "sub": "00000000-0000-0000-0000-000000000001"}).encode()).decode()

class H(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=str(ROOT), **k)
    def log_message(self, *a): pass
    def send_json(self, code, obj):
        b = json.dumps(obj).encode() if obj is not None else b""
        self.send_response(code); self.send_header("Content-Type", "application/json"); self.send_header("Access-Control-Allow-Origin", "*"); self.end_headers(); self.wfile.write(b)
    def do_OPTIONS(self):
        self.send_response(204); self.send_header("Access-Control-Allow-Origin", "*"); self.send_header("Access-Control-Allow-Headers", "*"); self.send_header("Access-Control-Allow-Methods", "*"); self.end_headers()
    def proxy(self):
        n = int(self.headers.get("Content-Length") or 0); data = self.rfile.read(n) if n else None
        c = http.client.HTTPConnection("127.0.0.1", 8788, timeout=30)
        c.request(self.command, self.path, body=data, headers={k: v for k, v in self.headers.items() if k.lower() not in ("host",)})
        r = c.getresponse(); b = r.read()
        self.send_response(r.status)
        for k, v in r.getheaders():
            if k.lower() not in ("transfer-encoding", "connection", "content-length"): self.send_header(k, v)
        self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        if self.path.startswith("/.netlify/functions/"): return self.proxy()
        if self.path.startswith("/auth/v1/admin/users"):
            if self.claims()[0] != "service_role": return self.send_json(401, {"msg": "not allowed"})
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query); page = int(q.get("page", ["1"])[0])
            allu = [{"id": i, "email": e} for i, e in IDS.items()]
            return self.send_json(200, {"users": allu[(page - 1) * 200: page * 200]})
        if self.path.startswith("/assets/config.js"):
            b = f'export const SUPABASE_URL = "http://localhost:{PORT}";\nexport const SUPABASE_ANON_KEY = "anon-key";\n'.encode()
            self.send_response(200); self.send_header("Content-Type", "text/javascript"); self.end_headers(); self.wfile.write(b); return
        return super().do_GET()
    def body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n) or b"null") if n else None
    def claims(self):
        if self.headers.get("apikey") == "sb_secret_local": return "service_role", {}
        tok = (self.headers.get("Authorization") or "").replace("Bearer ", "")
        if tok.startswith("u."):
            return "authenticated", json.loads(base64.urlsafe_b64decode(tok[2:]).decode())
        return "anon", {}
    def do_PUT(self): self.do_POST()
    def do_POST(self):
        if self.path.startswith("/.netlify/functions/"): return self.proxy()
        u = urllib.parse.urlparse(self.path); q = urllib.parse.parse_qs(u.query); b = self.body() or {}
        if u.path.startswith("/rest/v1/rpc/"):
            fn = u.path.rsplit("/", 1)[1]
            types = argtypes(fn)
            if types is None: return self.send_json(404, {"message": "function not found"})
            args = []
            for k, v in b.items():
                ty = types.get(k)
                if ty is None: return self.send_json(400, {"message": f"unknown argument {k}"})
                if isinstance(v, (dict, list)) and not ty.endswith("[]"): v = json.dumps(v)
                if ty.endswith("[]") and isinstance(v, list): args.append(f"{k} => {lit('{' + ','.join(json.dumps(x) for x in v) + '}')}::{ty}")
                else: args.append(f"{k} => {lit(v)}::{ty}")
            role, cl = self.claims()
            sql = f"set role {role}; select set_config('request.jwt.claims', {lit(json.dumps(cl))}, false); select to_jsonb(public.{fn}({', '.join(args)}));"
            r = subprocess.run(PSQL + ["-c", sql], capture_output=True, text=True)
            if r.returncode:
                msg = [l for l in r.stderr.splitlines() if l.startswith("ERROR:")]
                m = msg[0].replace("ERROR:", "").strip() if msg else r.stderr.strip()
                return self.send_json(401 if "permission denied" in m else 400, {"message": m})
            out = r.stdout.strip().splitlines()[-1] if r.stdout.strip() else "null"
            return self.send_json(200, json.loads(out))
        if u.path == "/auth/v1/token":
            if q.get("grant_type") == ["password"]:
                if USERS.get(b.get("email", "").lower()) != b.get("password"): return self.send_json(400, {"error_description": "Invalid login credentials"})
                e = b["email"].lower()
            else:
                e = json.loads(base64.urlsafe_b64decode(b["refresh_token"][2:]).decode())["email"]
            return self.send_json(200, {"access_token": token_for(e), "refresh_token": token_for(e), "expires_in": 3600, "expires_at": int(time.time()) + 3600, "user": {"email": e}})
        if u.path == "/auth/v1/signup":
            USERS[b["email"].lower()] = b["password"]
            e = b["email"].lower()
            return self.send_json(200, {"access_token": token_for(e), "refresh_token": token_for(e), "expires_in": 3600, "user": {"email": e}})
        if u.path == "/auth/v1/admin/users":
            if self.claims()[0] != "service_role": return self.send_json(401, {"msg": "not allowed"})
            e = b["email"].lower()
            if e in USERS: return self.send_json(422, {"msg": "A user with this email address has already been registered"})
            USERS[e] = b["password"]; uid = "00000000-0000-4000-8000-" + format(len(USERS), "012d"); IDS[uid] = e
            return self.send_json(200, {"id": uid, "email": e})
        if u.path.startswith("/auth/v1/admin/users/"):
            if self.claims()[0] != "service_role": return self.send_json(401, {"msg": "not allowed"})
            uid = u.path.rsplit("/", 1)[1]
            if uid not in IDS: return self.send_json(404, {"msg": "User not found"})
            USERS[IDS[uid]] = b["password"]; return self.send_json(200, {"id": uid})
        if u.path == "/auth/v1/recover": return self.send_json(200, {})
        if u.path == "/auth/v1/logout": return self.send_json(204, None)
        if u.path == "/auth/v1/user":
            role, cl = self.claims(); USERS[cl.get("email")] = b.get("password"); return self.send_json(200, {"email": cl.get("email")})
        return self.send_json(404, {"message": "not found"})

ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
