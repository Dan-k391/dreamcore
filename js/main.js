// Entry point: the game is built by importing it; this runs the frame loop.
import * as THREE from 'three';
import { renderer } from './core.js';
import { frame } from './player.js';

import './dev.js';
import { s, hooks } from './settings.js';

const clock = new THREE.Clock();
let drawn = false;
const loop = t => { hooks.frame?.(t ?? performance.now()); const dt = Math.min(clock.getDelta(), .05); if (window.dev?.hold) return; frame(dt); if (!drawn) drawn = performance.mark('load: first frame'); if (window.dev) dev.ready = true; };
// Vsync off (settings): the loop runs as often as the machine can instead of once per screen refresh. The browser still shows whole
// frames at the screen's rate, so nothing tears; a hidden tab is slowed to 4 frames a second, as the browser does to the other loop
const ch = new MessageChannel(), next = () => document.hidden ? setTimeout(() => ch.port2.postMessage(0), 250) : ch.port2.postMessage(0);
let free = false;
ch.port1.onmessage = () => { if (free) { loop(); next(); } };
hooks.vsync = on => { if (free === !on) return; free = !on; renderer.setAnimationLoop(on ? loop : null); if (free) next(); };
renderer.setAnimationLoop(loop); hooks.vsync(s.vsync);
