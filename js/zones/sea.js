// The calm sea outside the pool hall, to the horizon, with a hole cut under the great baths' deep end (zones/baths.js), which goes below
// its top; the hall's floor covers the hole from above.
import { seaMat } from '../mat.js';
import { block } from '../build.js';

block(seaMat, -3000, -3, -3000, -1379, -1.5, 3000); block(seaMat, -1367, -3, -3000, 3000, -1.5, 3000);
block(seaMat, -1379, -3, -3000, -1367, -1.5, 1408.5); block(seaMat, -1379, -3, 1423.5, -1367, -1.5, 3000);
block(seaMat, -1379, -3.2, 1408.5, -1367, -2.9, 1460); // the hole's floor, run on under the sea so its middle lies outside the baths' box: no zone's mesh, as the rest of the sea
