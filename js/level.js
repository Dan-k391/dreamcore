// The level: every place, in this order (it is the order zones register, are baked and override each other's floors in),
// then one mesh per material. To add a place: a new file in zones/ and one import line here.
import { merge } from './build.js';
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

merge();
