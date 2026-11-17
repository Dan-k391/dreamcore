// The look layer's parameters and the one validation every look goes through (the game's dev.look.set, tools/serve.mjs). No imports: Node uses it too.
// A look is { all: { id: value }, zones: { zoneId: { id: value } } }: deltas from what the code defines, a multiplier (mul, 1 = as built) or an
// offset (add, 0 = as built). A zone's own entry is laid over `all` (multipliers multiply, offsets add). docs/look.md has the full story.
const P = (id, group, label, kind, min, max, step, help, perZone = true) => ({ id, group, label, kind, min, max, step, neutral: kind === 'mul' ? 1 : 0, perZone, help });
const params = [
  P('light.strength', 'light', 'Room light', 'mul', .3, 2, .05, "All of a room's light together: its lamps, its ceiling fixtures and its ambient (bounce light and reflections), so the room stays consistent."),
  P('light.warmth', 'light', 'Lamp warmth', 'add', -.5, 1, .05, 'Colour of the lamps and fixtures: up is amber, down is paler (never pure white).'),
  P('light.ambient', 'light', 'Ambient fill', 'mul', 0, 2, .05, "The room's captured bounce light and reflections alone: lower gives deeper shadows, higher fills them."),
  P('light.sun', 'light', 'Sun', 'mul', 0, 3, .05, "The sun's strength, in places under a sky. One sun lights a whole sky, so it follows the zone you stand in (mixed near openings)."),
  P('exposure', 'exposure', 'Exposure', 'add', -1.5, 1.5, .1, 'Exposure in stops (+1 doubles). Follows the zone you stand in, mixed near openings.'),
  P('mat.rough', 'materials', 'Roughness', 'mul', .3, 2, .05, "Every surface's roughness in the room: lower is glossier, sharper reflections."),
  P('mat.wet', 'materials', 'Wetness', 'add', 0, 1, .05, 'Surfaces look wet: glossier and a little darker, as damp stone and tile are.'),
  P('water.scatter', 'water', 'Water body', 'mul', 0, 3, .05, "The pale glow deep water scatters back (each pool's own colour)."),
  P('water.clarity', 'water', 'Water clarity', 'mul', .25, 4, .05, 'How far you see into the water: up is clearer, down murkier and bluer sooner.'),
  P('water.reflect', 'water', 'Water reflection', 'mul', 0, 2.5, .05, "Strength of the water's mirror (the Fresnel reflection)."),
  P('water.waves', 'water', 'Water ripple', 'mul', 0, 3, .05, "How much the surface's ripples bend reflection and refraction (the picture only: floating things ride the same waves)."),
  P('fog.density', 'fog', 'Fog density', 'mul', 0, 4, .05, 'Distance fog. Follows the zone you stand in, mixed near openings.'),
  P('fog.color', 'fog', 'Fog brightness', 'mul', 0, 3, .05, "The fog's colour, brighter or darker (its hue kept)."),
  P('bloom.strength', 'bloom', 'Bloom', 'mul', 0, 2.5, .05, 'Glow around bright things. Follows the zone you stand in.'),
  P('bloom.threshold', 'bloom', 'Bloom threshold', 'add', -.5, .15, .01, 'How bright a thing must be to glow (down: more things glow). One for the whole game: `all` only.', false),
  P('bloom.radius', 'bloom', 'Bloom spread', 'add', -.8, .05, .01, "How wide the glow spreads. One for the whole game: `all` only.", false),
  P('shafts', 'atmosphere', 'Sun shafts', 'mul', 0, 3, .05, 'Light shafts through the air from the sun, where a place has them. Follows the zone you stand in.'),
  P('grade.sat', 'grade', 'Saturation', 'mul', 0, 2, .05, 'Colour saturation. Follows the zone you stand in.'),
  P('grade.temp', 'grade', 'Temperature', 'add', -1, 1, .05, 'The whole picture warmer (amber) or cooler (blue).'),
  P('grade.tint', 'grade', 'Tint', 'add', -1, 1, .05, 'The whole picture toward green (up) or magenta (down).'),
  P('grade.contrast', 'grade', 'Contrast', 'add', -.4, .5, .02, 'The film S-curve: up gives deeper darks and cleaner highlights.'),
  P('grade.vignette', 'grade', 'Vignette', 'mul', 0, 2, .05, 'Darkening toward the corners.'),
  P('grade.grain', 'grade', 'Grain', 'mul', 0, 3, .05, 'Film grain. One for the whole game: `all` only.', false),
];
const byId = Object.fromEntries(params.map(p => [p.id, p]));
// -> a clean look: unknown ids, non-numbers and per-zone entries of all-only parameters dropped, values clamped. zoneIds: the ids allowed, if known
function sanitize(look, zoneIds) {
  const out = { all: {}, zones: {} }, set = (src, dst, zone) => {
    if (!src || typeof src !== 'object' || Array.isArray(src)) return;
    for (const [id, v] of Object.entries(src)) { const p = byId[id]; if (!p || (zone && !p.perZone) || typeof v !== 'number' || !Number.isFinite(v)) continue;
      dst[id] = Math.min(p.max, Math.max(p.min, v)); } };
  if (!look || typeof look !== 'object') return out;
  set(look.all, out.all, false);
  if (look.zones && typeof look.zones === 'object') for (const [z, o] of Object.entries(look.zones)) {
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(z) || (zoneIds && !zoneIds.includes(z))) continue;
    const d = {}; set(o, d, true); if (Object.keys(d).length) out.zones[z] = d; }
  return out;
}
export { params, byId, sanitize };
