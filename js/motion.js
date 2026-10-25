// Springs for things that move, after Apple's motion rules. A spring knows only
// where it is, how fast it is going and where it is heading, so a new target
// mid-flight turns it round smoothly at its current speed, where a timed ease
// would start over.
//
// Tuned the way Apple tunes them: `response` is roughly how long a move takes,
// in seconds, and `dampingRatio` is how much it is held back (1 settles with no
// overshoot; lower bounces). `precision` is how close counts as arrived, in the
// value's own units.
export function createSpring(initial, onUpdate, { response = 0.35, dampingRatio = 1, precision = 0.5 } = {}) {
  const stiffness = ((2 * Math.PI) / response) ** 2;
  const damping = (4 * Math.PI * dampingRatio) / response;
  let value = initial, velocity = 0, target = initial, frame = 0, last = 0;

  function step(now) {
    // Real seconds since the last frame, so a 120Hz screen moves at the same
    // speed as a 60Hz one. The first frame assumes 1/60 (its timestamp can be
    // earlier than the input that started it), and a stalled tab can't fling it.
    const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
    last = now;
    // Four small steps per frame keep the maths stable for stiff springs.
    for (let i = 0; i < 4; i++) {
      const h = dt / 4;
      velocity += (-stiffness * (value - target) - damping * velocity) * h;
      value += velocity * h;
    }
    if (Math.abs(value - target) < precision && Math.abs(velocity) < precision * 20) {
      value = target; velocity = 0; frame = 0; last = 0;
    } else {
      frame = requestAnimationFrame(step);
    }
    onUpdate(value);
  }

  return {
    // Head for `next` from wherever it is, at whatever speed it has. Pass the
    // release velocity (units per second) to carry a flick on after a drag.
    to(next, releaseVelocity) {
      target = next;
      if (releaseVelocity !== undefined) velocity = releaseVelocity;
      if (!frame) frame = requestAnimationFrame(step);
    },
    // Jump with no motion: under reduced motion, or to catch up with a value
    // that moved some other way.
    set(next) {
      this.stop();
      value = target = next;
      onUpdate(value);
    },
    stop() { cancelAnimationFrame(frame); frame = 0; last = 0; velocity = 0; },
    get value() { return value; },
    get target() { return target; },
    get moving() { return frame !== 0; },
  };
}
