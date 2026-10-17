import fs from "fs";
const src = fs.readFileSync(new URL("./content_src.js", import.meta.url), "utf8");
const fn = new Function(src + "\nreturn {TRACKS, STAGES, buildWeeks, PLACEMENT, PROJECT_BRIEF, TRACK_WEEK_TITLES};");
const C = fn();
const out = { stages: C.STAGES, tracks: {} }, keys = [];
for (const t of Object.keys(C.TRACKS)) {
  const ws = C.buildWeeks(t);
  out.tracks[t] = ws.map((w, wi) => ({
    week: wi + 1, stage: w.stage, title: w.title, objectives: w.objectives || null, resources: w.resources || null,
    items: w.items.map((it, ii) => {
      const key = `w${wi + 1}-${ii + 1}`;
      const o = { key, type: it.type, title: it.title };
      for (const k of ["mins", "points", "intro", "detail", "link", "opt", "proj", "wk", "pass"]) if (it[k] != null && it[k] !== false) o[k] = it[k];
      if (it.qs) o.qs = it.qs.map((q) => ({ q: q.q, o: q.o }));
      keys.push({ track: t, week: wi + 1, key, type: it.type, title: it.title, proj: !!it.proj, opt: !!it.opt, link: !!it.link, answers: it.qs ? it.qs.map((q) => q.a) : null });
      return o;
    }),
  }));
}
fs.writeFileSync(new URL("./course.json", import.meta.url), JSON.stringify(out));
fs.writeFileSync(new URL("./keys.json", import.meta.url), JSON.stringify(keys));
console.log(Object.keys(out.tracks), out.tracks.DAT.length, keys.length, out.tracks.DAT.map((w) => w.items.length).join(","));
