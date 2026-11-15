// Shadow-map cost of a walk through the hotel and the backrooms (tools/browse.mjs --eval-file, ?dev&bare): how many lamp and sun
// maps are redrawn and the triangles those redraws draw. Run speed, one continuous walk; frames at 1/60.
(async () => {
  const r = dev.renderer, SM = r.shadowMap, draw = SM.render, c = { passes: 0, lampMaps: 0, sunMaps: 0, tris: 0, frames: 0 };
  SM.render = function (lights, ...a) {
    if (SM.needsUpdate) { c.passes++; for (const l of lights) if (l.shadow.needsUpdate || l.shadow.autoUpdate) l.isDirectionalLight ? c.sunMaps++ : c.lampMaps++; }
    const t = r.info.render.triangles; draw.call(this, lights, ...a); c.tris += r.info.render.triangles - t;
  };
  const run = (yaw, secs) => { dev.key('KeyW', true); dev.key('ShiftLeft', true); const p = dev.state();
    dev.go(p.x, p.z, yaw); dev.key('KeyW', true); dev.key('ShiftLeft', true); dev.step(Math.round(secs * 60)); c.frames += Math.round(secs * 60); dev.key('KeyW', false); dev.key('ShiftLeft', false); };
  dev.reset(3.8, 50, 0); dev.step(2); Object.assign(c, { passes: 0, lampMaps: 0, sunMaps: 0, tris: 0, frames: 0 });
  run(0, 6); run(Math.PI / 2, 2.5); run(0, 1.5); run(-Math.PI / 2, 4); run(Math.PI, 2); run(-Math.PI / 2, 2); run(Math.PI, 5);
  SM.render = draw; return JSON.stringify({ ...c, end: dev.state() });
})()
