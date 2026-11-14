// The level: every place, in this order (it is the order zones register, are baked and override each other's floors in),
// then one mesh per material. To add a place: a new file in zones/ and one import line here, plus, only if it needs them:
// a row in `tunnels` (zones/passages.js) for a far-off place reached by a dark passage; an entry in `skies` (sky.js) and a key
// in `skyOnly` (build.js) for a new sky; its zone id in a neighbouring pool's seen-from list (that pool's place file) if the
// pool shows through a doorway from it.
import { merge } from './build.js';
import { bakeLibrary } from './tex.js';
import './zones/backrooms.js';
import './zones/poolhall.js';
import './zones/arcade.js';
import './zones/nighthall.js';
import './zones/gallery.js';
import './zones/vault.js';
import './zones/passages.js';
import './zones/hotel.js';
import './zones/mall.js';
import './zones/softplay.js';
import './zones/cinema.js';
import './zones/parking.js';
import './zones/field.js';
import './zones/carpark.js';
import './zones/terrace.js';
import './zones/sea.js';
if (new URLSearchParams(location.search).has('dev')) await import('./zones/showroom.js'); // the material showroom: test builds only

merge();
await bakeLibrary(); // every library texture the places asked for, on the GPU, before anything is drawn
