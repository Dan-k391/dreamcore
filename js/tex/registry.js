// The material library's two registries, filled by the family files in this folder (tex.js imports them in a fixed order,
// which is also the showroom's order). No imports: a family file can load before anything else.
const sets = {}; // texture set name -> { name, m: metres covered, a / b: albedo / normal size (a 0: no albedo), r0: mean roughness, cav: crevice darkening per mm, glsl }
const LIB = {}; // material name -> [texture set name, shader options] (the options are listed in mat.js)

// set(name, metres, albedo px, normal px, mean roughness, crevice darkening per mm, GLSL body of surf(), GLSL helpers it calls)
function set(name, m, a, b, r0, cav, body, pre = '') {
  if (sets[name]) throw new Error('texture set ' + name + ' made twice');
  // the bake box-filters at most 4x4 texels of the bigger map into one of the smaller: a wider ratio would drop texels
  if (a && Math.max(a, b) / Math.min(a, b) > 4) throw new Error('set ' + name + ': albedo and normal sizes differ by more than 4x');
  sets[name] = { name, m, a, b, r0, cav, glsl: `${pre}\nvoid surf(vec2 uv, inout vec3 c, inout float h, inout float r, inout float m, inout float t) {\n${body}\n}` };
}
// mat(name, texture set, options): a library material (M(zone, name) in mat.js makes it)
function mat(name, setName, o = {}) {
  if (LIB[name]) throw new Error('material ' + name + ' made twice');
  LIB[name] = [setName, o];
}

export { sets, LIB, set, mat };
