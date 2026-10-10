import { Obstacle } from '../components/Desk';

// The desk in world units, shared by every device and both online players.
// It is a long desk with the pens starting at its two short ends; game.tsx
// scales it to the screen (and turns it upright on tall screens).
const DESK_MARGIN = 16; // Room around the desk so falling pens stay visible
export const DESK_WIDTH = 500;  // Long side, along which the pens face each other
export const DESK_HEIGHT = 340;
export const DESK_X = DESK_MARGIN;
export const DESK_Y = DESK_MARGIN;

// Random number helper
const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

// Generate randomized obstacles with center barrier
export const generateObstacles = (): Obstacle[] => {
  const obstacles: Obstacle[] = [];

  // ERASER - Fixed exactly in the center of the desk
  obstacles.push({
    id: 'eraser',
    type: 'eraser',
    x: DESK_X + DESK_WIDTH / 2 - 19,
    y: DESK_Y + DESK_HEIGHT / 2 - 10,
    width: 38,
    height: 20,
    rotation: randomInRange(-15, 15),
  });

  const midY = DESK_Y + DESK_HEIGHT / 2;

  // Helper to check if a new obstacle is safe
  const isSafe = (x: number, y: number, w: number, h: number, attempts: number) => {
    // 1. Give player pens specific safe spawn clearings
    const cx = x + w / 2;
    const cy = y + h / 2;

    // Check P1 (Left Spawn) Bubble
    if (Math.abs(cx - (DESK_X + 80)) < w / 2 + 60 && Math.abs(cy - midY) < h / 2 + 60) return false;
    // Check P2 (Right Spawn) Bubble
    if (Math.abs(cx - (DESK_X + DESK_WIDTH - 80)) < w / 2 + 60 && Math.abs(cy - midY) < h / 2 + 60) return false;
    // Check Center Eraser Bubble
    if (Math.abs(cx - (DESK_X + DESK_WIDTH / 2)) < w / 2 + 30 && Math.abs(cy - midY) < h / 2 + 30) return false;

    // 2. Progressive AABB overlap matrix
    for (const obs of obstacles) {
      const repulseMargin = attempts < 50 ? 180 : (attempts < 100 ? 60 : 5);
      if (
        x < obs.x + obs.width + repulseMargin &&
        x + w > obs.x - repulseMargin &&
        y < obs.y + obs.height + repulseMargin &&
        y + h > obs.y - repulseMargin
      ) {
        return false;
      }
    }

    return true;
  };

  // Define the items to place
  const itemsToPlace = [
    { id: 'notebook', type: 'notebook' as const, width: 80, height: 100, rotRange: 15 },
    { id: 'calculator', type: 'calculator' as const, width: 60, height: 80, rotRange: 10 },
    { id: 'ruler-1', type: 'ruler' as const, width: 140, height: 20, rotRange: 20 },
  ];

  for (const item of itemsToPlace) {
    let placed = false;
    let attempts = 0;

    while (!placed && attempts < 150) {
      attempts++;
      const x = DESK_X + randomInRange(20, DESK_WIDTH - item.width - 20);
      const y = DESK_Y + randomInRange(20, DESK_HEIGHT - item.height - 20);

      if (isSafe(x, y, item.width, item.height, attempts)) {
        obstacles.push({
          id: item.id,
          type: item.type,
          x,
          y,
          width: item.width,
          height: item.height,
          rotation: randomInRange(-item.rotRange, item.rotRange),
        });
        placed = true;
      }
    }

    // Fallback if 150 attempts failed
    if (!placed) {
      obstacles.push({
        id: item.id,
        type: item.type,
        x: DESK_X + randomInRange(50, DESK_WIDTH - item.width - 50),
        y: DESK_Y + randomInRange(50, DESK_HEIGHT - item.height - 50),
        width: item.width,
        height: item.height,
        rotation: randomInRange(-item.rotRange, item.rotRange),
      });
    }
  }

  return obstacles;
};
