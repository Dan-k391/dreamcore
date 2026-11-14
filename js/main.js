// Entry point: the game is built by importing it; this runs the frame loop.
import * as THREE from 'three';
import { renderer } from './core.js';
import { frame } from './player.js';

import './dev.js';

const clock = new THREE.Clock();
let drawn = false;
renderer.setAnimationLoop(() => { const dt = Math.min(clock.getDelta(), .05); if (window.dev?.hold) return; frame(dt); if (!drawn) drawn = performance.mark('load: first frame'); if (window.dev) dev.ready = true; });
