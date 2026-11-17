// A stationary resize must show the same grass as a freshly rebuilt view, at the same pose and shader clock.
export async function grassViewport(dev) {
  const { composer } = await import('../js/post.js');
  const { renderer, camera, scene, THREE } = dev;
  const widthProperty = Object.getOwnPropertyDescriptor(window, 'innerWidth'), heightProperty = Object.getOwnPropertyDescriptor(window, 'innerHeight'), held = dev.hold;
  const resize = width => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 720 });
    dispatchEvent(new Event('resize'));
  };
  const fresh = () => {
    const fov = camera.fov; camera.fov = fov + .001; camera.updateProjectionMatrix(); composer.render(0);
    camera.fov = fov; camera.updateProjectionMatrix(); composer.render(0);
  };
  const counts = () => scene.children.filter(mesh => mesh.name.startsWith('field-grass-')).map(mesh => mesh.geometry.instanceCount);
  const pose = () => JSON.stringify([camera.position.toArray(), camera.quaternion.toArray(), camera.fov]);
  const read = () => {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2()), pixels = new Uint8Array(size.x * size.y * 4), gl = renderer.getContext();
    gl.readPixels(0, 0, size.x, size.y, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return { pixels, width: size.x, height: size.y };
  };
  dev.hold = true;
  try {
    resize(480); dev.reset(8, 680, Math.PI, -.42); dev.step(90); fresh();
    const portrait = counts(), initialPose = pose();
    resize(1280);
    camera.userData.cut = true; for (let frame = 0; frame < 30; frame++) composer.render(0); // both runs from fresh AO history (js/ao.js), or they differ by its sample sequence
    const resized = counts(), before = read();
    fresh();
    camera.userData.cut = true; for (let frame = 0; frame < 30; frame++) composer.render(0); // both runs from fresh AO history (js/ao.js), or they differ by its sample sequence
    const rebuilt = counts(), after = read();
    let sum = 0, maxDelta = 0, changedOver24 = 0;
    for (let offset = 0; offset < before.pixels.length; offset += 4) {
      let pixelDelta = 0;
      for (let channel = 0; channel < 3; channel++) {
        const delta = Math.abs(before.pixels[offset + channel] - after.pixels[offset + channel]);
        sum += delta; pixelDelta = Math.max(pixelDelta, delta);
      }
      maxDelta = Math.max(maxDelta, pixelDelta); if (pixelDelta > 24) changedOver24++;
    }
    return { samePose: pose() === initialPose, width: before.width, height: before.height, portrait, resized, rebuilt,
      meanDelta: sum / (before.width * before.height * 3), maxDelta, changedOver24, glError: renderer.getContext().getError() };
  } finally {
    if (widthProperty) Object.defineProperty(window, 'innerWidth', widthProperty); else delete window.innerWidth;
    if (heightProperty) Object.defineProperty(window, 'innerHeight', heightProperty); else delete window.innerHeight;
    dispatchEvent(new Event('resize')); dev.hold = held;
  }
}
