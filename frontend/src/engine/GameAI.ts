import { PenStats } from '../store/gameStore';
import { Obstacle } from '../components/Desk';

export interface AIDecision {
  hitPoint: { x: number; y: number };
  force: { x: number; y: number };
  power: number;
}

export class GameAI {
  private difficulty: 'easy' | 'medium' | 'hard';

  constructor(difficulty: 'easy' | 'medium' | 'hard' = 'medium') {
    this.difficulty = difficulty;
  }

  calculateShot(
    aiPenPos: { x: number; y: number; angle: number },
    playerPenPos: { x: number; y: number; angle: number },
    deskBounds: { x: number; y: number; width: number; height: number },
    aiPen: PenStats,
    obstacles: Obstacle[] = []
  ): AIDecision {

    // ── 1. DECIDE STRATEGY ────────────────────────────────────────────────────
    const strategy = this.decideStrategy(aiPenPos, playerPenPos, deskBounds);

    // ── 2. DETERMINE TARGET POINT (with obstacle-aware routing) ───────────────
    let targetPoint = { x: playerPenPos.x, y: playerPenPos.y };
    let isBankShot = false;
    let isFullyBlocked = false;

    if (strategy !== 'defensive') {
      const directBlocked = this.checkPathBlocked(aiPenPos, targetPoint, obstacles);

      if (directBlocked) {
        // ── Try geometrically correct wall bank shots ──────────────────────────
        // For a top-bank: reflect the AI's position across the top wall, then
        // find the wall X that bisects the AI→wall→player V-path correctly.
        const topWallY = deskBounds.y + 5; // slightly inside to avoid edge clipping
        const botWallY = deskBounds.y + deskBounds.height - 5;

        // Correct reflection: bounce point X = weighted midpoint by distance ratios
        const topDist = Math.abs(aiPenPos.y - topWallY) + Math.abs(playerPenPos.y - topWallY);
        const topBounceX = topDist > 0
          ? aiPenPos.x + (playerPenPos.x - aiPenPos.x) * (Math.abs(aiPenPos.y - topWallY) / topDist)
          : (aiPenPos.x + playerPenPos.x) / 2;
        const topBounce = { x: Math.max(deskBounds.x + 20, Math.min(deskBounds.x + deskBounds.width - 20, topBounceX)), y: topWallY };
        const topClear = !this.checkPathBlocked(aiPenPos, topBounce, obstacles) &&
                         !this.checkPathBlocked(topBounce, targetPoint, obstacles);

        if (topClear) {
          targetPoint = topBounce;
          isBankShot = true;
        } else {
          const botDist = Math.abs(aiPenPos.y - botWallY) + Math.abs(playerPenPos.y - botWallY);
          const botBounceX = botDist > 0
            ? aiPenPos.x + (playerPenPos.x - aiPenPos.x) * (Math.abs(aiPenPos.y - botWallY) / botDist)
            : (aiPenPos.x + playerPenPos.x) / 2;
          const botBounce = { x: Math.max(deskBounds.x + 20, Math.min(deskBounds.x + deskBounds.width - 20, botBounceX)), y: botWallY };
          const botClear = !this.checkPathBlocked(aiPenPos, botBounce, obstacles) &&
                           !this.checkPathBlocked(botBounce, targetPoint, obstacles);

          if (botClear) {
            targetPoint = botBounce;
            isBankShot = true;
          } else {
            // ALL paths blocked — do NOT shoot into the obstacle.
            // Instead, aim toward desk center at low power to reposition safely.
            isFullyBlocked = true;
          }
        }
      }
    }

    // ── 3. BUILD DIRECTION VECTOR ──────────────────────────────────────────────
    let dirX: number;
    let dirY: number;

    if (strategy === 'defensive' || isFullyBlocked) {
      // Head straight to desk center to reposition safely
      const centerX = deskBounds.x + deskBounds.width / 2;
      const centerY = deskBounds.y + deskBounds.height / 2;
      const cDist = Math.max(1, Math.hypot(centerX - aiPenPos.x, centerY - aiPenPos.y));
      dirX = (centerX - aiPenPos.x) / cDist;
      dirY = (centerY - aiPenPos.y) / cDist;
    } else {
      const dx = targetPoint.x - aiPenPos.x;
      const dy = targetPoint.y - aiPenPos.y;
      const dist = Math.max(1, Math.hypot(dx, dy));
      dirX = dx / dist;
      dirY = dy / dist;
    }

    // ── 4. APPLY ACCURACY JITTER (human-imperfection model) ───────────────────
    const accuracy = this.getAccuracy();
    const maxJitter = (1 - accuracy) * (Math.PI / 4);
    const jitter = (Math.random() - 0.5) * maxJitter;
    const cos = Math.cos(jitter);
    const sin = Math.sin(jitter);
    const finalDirX = dirX * cos - dirY * sin;
    const finalDirY = dirX * sin + dirY * cos;

    // ── 5. CALCULATE RAW FORCE MAGNITUDE ──────────────────────────────────────
    // Physics engine: velocity = force * (0.45 / mass) * powerMultiplier
    // Max speed is clamped at 15 units.
    // We want the AI pen to arrive at the player with good residual velocity,
    // so we deliberately shoot slightly past the distance to ensure knockback.
    //
    // Target launch speed: 70-85% of max (10.5~12.75 units) for normal combat.
    // Defensive recovery: 60% (9 units) to reach center without overshooting.
    // Edge-knock finish: 90% (13.5 units) maximum lethality.

    const targetSpeed = this.getTargetSpeed(strategy, isBankShot, isFullyBlocked);

    // Back-calculate the force needed to achieve targetSpeed after mass scaling.
    // velocity = force * (0.45 / mass)  =>  force = velocity * mass / 0.45
    const rawForceMagnitude = (targetSpeed * aiPen.mass) / 0.45;

    // Small variance (±8%) so shots aren't robotically identical
    const forceVariance = 1.0 + (Math.random() - 0.5) * 0.16;
    const finalForce = rawForceMagnitude * forceVariance;

    // ── 6. HIT POINT (center strike for power; slight offset for spin) ─────────
    // Hitting dead-center transfers 100% of momentum linearly (no spin bleed).
    // We add a tiny spin offset for realism but keep it small for hard AI.
    const spinRange = this.difficulty === 'hard' ? 3 : 8;
    const spinOffset = (Math.random() - 0.5) * spinRange;
    const hitPoint = {
      x: aiPenPos.x - finalDirX * 20 + finalDirY * spinOffset,
      y: aiPenPos.y - finalDirY * 20 - finalDirX * spinOffset,
    };

    const force = {
      x: finalDirX * finalForce,
      y: finalDirY * finalForce,
    };

    // power is used by the UI power bar display (0–1 range)
    const power = Math.min(1, targetSpeed / 15);

    return { hitPoint, force, power };
  }

  // ── HELPERS ──────────────────────────────────────────────────────────────────

  private getTargetSpeed(strategy: string, isBankShot: boolean = false, isFullyBlocked: boolean = false): number {
    // Fully blocked — gentle tap toward center, do not risk flying off walls
    if (isFullyBlocked) return 4.5;

    // Bank shots travel a much longer arc than direct shots.
    // Cap at 8 units so the pen doesn't ricochet off the wall at lethal speed.
    if (isBankShot) return Math.min(8.0, this.difficulty === 'hard' ? 8.5 : 7.5);

    // Raw speed values that feed into the physics engine's velocity calculation.
    // Max possible is 15 units (clamped by engine).
    const base: Record<string, number> = {
      'aggressive':  13.0,  // Devastating hit — player will travel far on contact
      'edge-knock':  14.5,  // Maximum lethality — instant kill when player near edge
      'defensive':   10.0,  // Firm recovery dash to center of board
    };
    let speed = base[strategy] ?? 13.0;

    switch (this.difficulty) {
      case 'easy':   speed *= 0.60; break;
      case 'hard':   speed *= 1.04; break;
      // medium: no change — already very aggressive
    }

    return Math.min(14.8, speed); // Hard cap just under engine clamp
  }

  private getAccuracy(): number {
    // Accuracy 0..1. Translated to max angle jitter in calculateShot.
    switch (this.difficulty) {
      case 'easy': return 0.70;  // ±6.75° — misses frequently
      case 'medium': return 0.94;  // ±1.35° — very precise, ~80% win rate
      case 'hard': return 0.99;  // ±0.27° — near-laser precision
      default: return 0.94;
    }
  }

  decideStrategy(
    aiPenPos: { x: number; y: number },
    playerPenPos: { x: number; y: number },
    deskBounds: { x: number; y: number; width: number; height: number }
  ): 'aggressive' | 'defensive' | 'edge-knock' {
    const edgeThreshold = 55;

    // If player is near any edge → finish them
    const playerNearEdge =
      playerPenPos.x < deskBounds.x + edgeThreshold ||
      playerPenPos.x > deskBounds.x + deskBounds.width - edgeThreshold ||
      playerPenPos.y < deskBounds.y + edgeThreshold ||
      playerPenPos.y > deskBounds.y + deskBounds.height - edgeThreshold;

    if (playerNearEdge) return 'edge-knock';

    // If AI itself is near an edge → save itself first
    const aiNearEdge =
      aiPenPos.x < deskBounds.x + edgeThreshold ||
      aiPenPos.x > deskBounds.x + deskBounds.width - edgeThreshold ||
      aiPenPos.y < deskBounds.y + edgeThreshold ||
      aiPenPos.y > deskBounds.y + deskBounds.height - edgeThreshold;

    if (aiNearEdge) return 'defensive';

    return 'aggressive';
  }

  // ── OBSTACLE RAYCAST ─────────────────────────────────────────────────────────

  private checkPathBlocked(
    start: { x: number; y: number },
    end: { x: number; y: number },
    obstacles: Obstacle[]
  ): boolean {
    for (const obs of obstacles) {
      const pad = 12;
      const minX = obs.x - pad;
      const maxX = obs.x + obs.width + pad;
      const minY = obs.y - pad;
      const maxY = obs.y + obs.height + pad;

      // Fast AABB endpoint inside check
      if (
        (start.x >= minX && start.x <= maxX && start.y >= minY && start.y <= maxY) ||
        (end.x >= minX && end.x <= maxX && end.y >= minY && end.y <= maxY)
      ) return true;

      // Line-segment vs each AABB edge
      if (
        this.segmentsIntersect(start, end, { x: minX, y: minY }, { x: maxX, y: minY }) ||
        this.segmentsIntersect(start, end, { x: maxX, y: minY }, { x: maxX, y: maxY }) ||
        this.segmentsIntersect(start, end, { x: maxX, y: maxY }, { x: minX, y: maxY }) ||
        this.segmentsIntersect(start, end, { x: minX, y: maxY }, { x: minX, y: minY })
      ) return true;
    }
    return false;
  }

  private segmentsIntersect(
    A: { x: number; y: number }, B: { x: number; y: number },
    C: { x: number; y: number }, D: { x: number; y: number }
  ): boolean {
    const denom = (B.x - A.x) * (D.y - C.y) - (B.y - A.y) * (D.x - C.x);
    if (denom === 0) return false;
    const t = ((C.x - A.x) * (D.y - C.y) - (C.y - A.y) * (D.x - C.x)) / denom;
    const u = ((C.x - A.x) * (B.y - A.y) - (C.y - A.y) * (B.x - A.x)) / denom;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  }
}
