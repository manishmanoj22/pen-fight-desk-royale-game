import Matter from 'matter-js';
import { Obstacle } from '../components/Desk';
import { PenStats } from '../store/gameStore';

const { Engine, World, Bodies, Body, Events, Vector, Resolver } = Matter;

export interface PenBody {
  body: Matter.Body;
  pen: PenStats;
  isPlayer: boolean;
}

export interface GamePhysicsConfig {
  deskWidth: number;
  deskHeight: number;
  deskX: number;
  deskY: number;
}

const FIXED_STEP = 1000 / 180; // ms of simulated time per physics step
const MAX_FRAME_TIME = 100; // Cap catch-up after a stall (e.g. a backgrounded tab)

export class GamePhysics {
  private accumulator = 0;
  private engine: Matter.Engine;
  private penBodies: Map<string, PenBody> = new Map();
  private obstacleBodies: Matter.Body[] = [];
  private walls: Matter.Body[] = [];
  private config: GamePhysicsConfig;
  private onPenFallOff: ((isPlayer: boolean) => void) | null = null;
  private onPensSettled: (() => void) | null = null;
  
  constructor(config: GamePhysicsConfig) {
    this.config = config;
    this.engine = Engine.create({
      gravity: { x: 0, y: 0 }, // Top-down view, no gravity
    });
    
    // Improve collision detection accuracy
    // @ts-ignore - Matter.js internal setting
    this.engine.positionIterations = 10; // More position solving iterations
    // @ts-ignore
    this.engine.velocityIterations = 10; // More velocity solving iterations
    
    // Set up collision detection
    Events.on(this.engine, 'collisionStart', this.handleCollision.bind(this));
  }
  
  initialize(playerPen: PenStats, aiPen: PenStats, obstacles: Obstacle[], capOn: boolean) {
    // Clear existing bodies
    World.clear(this.engine.world, false);
    this.penBodies.clear();
    this.obstacleBodies = [];
    this.walls = [];
    
    const { deskWidth, deskHeight, deskX, deskY } = this.config;
    
    // Create desk boundary sensors (to detect when pens fall off)
    // These are sensors - they detect collision but don't physically stop objects
    // Place them further out so pen must be COMPLETELY off the desk
    const wallThickness = 20;
    const fallOffMargin = 50; // Pen must go this far past edge to count as fallen
    
    // Create invisible walls outside desk edges (for fall-off detection)
    this.walls = [
      // Top
      Bodies.rectangle(deskX + deskWidth / 2, deskY - wallThickness / 2 - fallOffMargin, deskWidth + wallThickness * 2, wallThickness, { 
        isStatic: true, 
        isSensor: true,
        label: 'wall-top' 
      }),
      // Bottom
      Bodies.rectangle(deskX + deskWidth / 2, deskY + deskHeight + wallThickness / 2 + fallOffMargin, deskWidth + wallThickness * 2, wallThickness, { 
        isStatic: true, 
        isSensor: true,
        label: 'wall-bottom' 
      }),
      // Left
      Bodies.rectangle(deskX - wallThickness / 2 - fallOffMargin, deskY + deskHeight / 2, wallThickness, deskHeight + wallThickness * 2, { 
        isStatic: true, 
        isSensor: true,
        label: 'wall-left' 
      }),
      // Right
      Bodies.rectangle(deskX + deskWidth + wallThickness / 2 + fallOffMargin, deskY + deskHeight / 2, wallThickness, deskHeight + wallThickness * 2, { 
        isStatic: true, 
        isSensor: true,
        label: 'wall-right' 
      }),
    ];
    
    World.add(this.engine.world, this.walls);
    
    // Create pen bodies with improved collision settings
    // Include cap in the length for proper collision
    const penLength = 95; // Full length including cap
    const penWidth = 14;
    const capEffect = capOn ? 1.1 : 1.0; // Cap affects center of gravity slightly
    
    // Common settings for better collision detection
    const penCollisionSettings = {
      slop: 0.005, // Very tight collision tolerance
      chamfer: { radius: 4 }, // Rounded corners for smoother collision
    };
    
    // Player pen - left side
    const playerBody = Bodies.rectangle(
      deskX + 80,
      deskY + deskHeight / 2,
      penLength,
      penWidth,
      {
        friction: playerPen.friction * 0.2, // Collision friction
        frictionAir: playerPen.friction * 0.06, // Realistic desktop sliding friction
        frictionStatic: playerPen.friction * 0.4, // Grip before moving
        restitution: 0.5, // Less bouncy
        mass: playerPen.mass * capEffect,
        label: 'pen-player',
        ...penCollisionSettings,
      }
    );
    Body.setMass(playerBody, playerPen.mass * capEffect);
    Body.setAngle(playerBody, 0);
    
    // AI pen - right side
    const aiBody = Bodies.rectangle(
      deskX + deskWidth - 80,
      deskY + deskHeight / 2,
      penLength,
      penWidth,
      {
        friction: aiPen.friction * 0.2,
        frictionAir: aiPen.friction * 0.06, 
        frictionStatic: aiPen.friction * 0.4,
        restitution: 0.5, // Good bounce
        mass: aiPen.mass,
        label: 'pen-ai',
        ...penCollisionSettings,
      }
    );
    Body.setMass(aiBody, aiPen.mass);
    Body.setAngle(aiBody, Math.PI); // Face opposite direction
    
    this.penBodies.set('player', { body: playerBody, pen: playerPen, isPlayer: true });
    this.penBodies.set('ai', { body: aiBody, pen: aiPen, isPlayer: false });
    
    World.add(this.engine.world, [playerBody, aiBody]);
    
    // Create obstacles - these are SOLID bodies pens will bounce off
    obstacles.forEach((obstacle) => {
      const obstacleBody = Bodies.rectangle(
        obstacle.x + obstacle.width / 2,
        obstacle.y + obstacle.height / 2,
        obstacle.width,
        obstacle.height,
        {
          isStatic: true,
          friction: 0.5,
          restitution: 0.7, // Good bounce
          angle: (obstacle.rotation * Math.PI) / 180,
          label: `obstacle-${obstacle.id}`,
        }
      );
      this.obstacleBodies.push(obstacleBody);
    });
    
    World.add(this.engine.world, this.obstacleBodies);
    
    // Note: No edge walls - pens can fall off the desk (that's the win condition)
  }
  
  private handleCollision(event: Matter.IEventCollision<Matter.Engine>) {
    const pairs = event.pairs;
    
    pairs.forEach((pair) => {
      const { bodyA, bodyB } = pair;
      
      // Check if a pen hit a wall sensor
      const isWall = (label: string) => label.startsWith('wall-');
      const isPen = (label: string) => label.startsWith('pen-');
      
      if ((isWall(bodyA.label) && isPen(bodyB.label)) ||
          (isPen(bodyA.label) && isWall(bodyB.label))) {
        const penBody = isPen(bodyA.label) ? bodyA : bodyB;
        const isPlayer = penBody.label === 'pen-player';
        
        // Pen fell off the desk!
        if (this.onPenFallOff) {
          this.onPenFallOff(isPlayer);
        }
      }
    });
  }
  
  flickPen(isPlayer: boolean, hitPoint: { x: number; y: number }, force: { x: number; y: number }, powerMultiplier: number = 1) {
    const penKey = isPlayer ? 'player' : 'ai';
    const penData = this.penBodies.get(penKey);
    
    if (!penData) return;
    
    const { body, pen } = penData;
    const penCenter = body.position;
    
    // Calculate hit offset relative to center of mass
    const hitOffset = Vector.sub(hitPoint, penCenter);
    const hitDistance = Vector.magnitude(hitOffset);
    
    // Calculate raw cross-product torque (r x F)
    const rawTorque = hitOffset.x * force.y - hitOffset.y * force.x;
    
    // Map torque directly to angular velocity.
    // Max typical torque is ~35 (half pen length) * ~20 (max force) = ~700.
    const torqueMultiplier = 0.0003;
    const angularVelocity = rawTorque * torqueMultiplier * pen.rotationSpeed * powerMultiplier;
    Body.setAngularVelocity(body, angularVelocity);
    
    // Calculate how 'glancing' the blow is. 
    // If the force is applied perpendicular to the edge of the pen, it spins away from the finger.
    // This bleeds the linear impulse. If it is parallel, 100% of the force becomes linear movement.
    const forceMag = Vector.magnitude(force);
    let perpendicularity = 0;
    
    if (hitDistance > 1 && forceMag > 0.1) {
       perpendicularity = Math.abs(rawTorque) / (hitDistance * forceMag);
    }
    
    // The deeper towards the edge, the more the glancing blow bleeds linear momentum
    const edgeFactor = Math.min(hitDistance / 35, 1); // 0 at center, 1 at typical edge
    
    // Keep between 40% (max spin attack) and 100% (perfect parallel slider)
    const glancingReduction = 1 - (perpendicularity * edgeFactor * 0.6); 
    
    // Apply linear velocity (Impulse / Mass = Velocity)
    // Heavy pens launch significantly slower, lighter pens act like rockets
    const velocityScale = (0.45 / pen.mass) * powerMultiplier * glancingReduction;
    const maxSpeed = 15; // Maximum speed to prevent tunneling
    let velocity = {
      x: force.x * velocityScale,
      y: force.y * velocityScale
    };
    
    // Clamp velocity if too fast
    const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
    if (speed > maxSpeed) {
      const scale = maxSpeed / speed;
      velocity = {
        x: velocity.x * scale,
        y: velocity.y * scale
      };
    }
    
    Body.setVelocity(body, velocity);
    
    console.log('Flick applied:', { 
      velocity, 
      angularVelocity, 
      hitDistance, 
      rawTorque, 
      glancingReduction 
    });
  }
  
  // Advance the simulation by real elapsed time using fixed-size steps, so a
  // flick plays out identically at 60Hz, 120Hz or on a device dropping frames.
  // Small steps (3 per 60Hz frame) also keep collision detection accurate.
  update(deltaTime: number) {
    this.accumulator += Math.min(deltaTime, MAX_FRAME_TIME);

    while (this.accumulator >= FIXED_STEP) {
      Engine.update(this.engine, FIXED_STEP);
      this.accumulator -= FIXED_STEP;
    }
  }
  
  getPenPosition(isPlayer: boolean): { x: number; y: number; angle: number } | null {
    const penKey = isPlayer ? 'player' : 'ai';
    const penData = this.penBodies.get(penKey);
    
    if (!penData) return null;
    
    return {
      x: penData.body.position.x,
      y: penData.body.position.y,
      angle: penData.body.angle,
    };
  }
  
  // Check if pen center of gravity is outside the desk bounds
  isPenOffDesk(isPlayer: boolean): boolean {
    const penKey = isPlayer ? 'player' : 'ai';
    const penData = this.penBodies.get(penKey);
    
    if (!penData) return false;
    
    const pos = penData.body.position;
    const { deskX, deskY, deskWidth, deskHeight } = this.config;
    
    // Game ends when center of gravity (pen center) is outside desk bounds
    return (
      pos.x < deskX ||
      pos.x > deskX + deskWidth ||
      pos.y < deskY ||
      pos.y > deskY + deskHeight
    );
  }
  
  arePensSettled(): boolean {
    let settled = true;
    
    this.penBodies.forEach((penData) => {
      const velocity = penData.body.velocity;
      const angularVelocity = penData.body.angularVelocity;
      
      const speed = Math.sqrt(velocity.x ** 2 + velocity.y ** 2);
      
      if (speed > 0.1 || Math.abs(angularVelocity) > 0.01) {
        settled = false;
      }
    });
    
    return settled;
  }
  
  setOnPenFallOff(callback: (isPlayer: boolean) => void) {
    this.onPenFallOff = callback;
  }
  
  setOnPensSettled(callback: () => void) {
    this.onPensSettled = callback;
  }
  
  calculateTrajectory(
    startX: number,
    startY: number,
    forceX: number,
    forceY: number,
    numPoints: number = 10
  ): { x: number; y: number }[] {
    const points: { x: number; y: number }[] = [];
    const friction = 0.98; // Simulate friction decay
    
    let x = startX;
    let y = startY;
    let vx = forceX * 0.5;
    let vy = forceY * 0.5;
    
    for (let i = 0; i < numPoints; i++) {
      x += vx * 3;
      y += vy * 3;
      vx *= friction;
      vy *= friction;
      
      points.push({ x, y });
    }
    
    return points;
  }
  
  resetPenPositions(deskX: number, deskY: number, deskWidth: number, deskHeight: number) {
    const playerPen = this.penBodies.get('player');
    const aiPen = this.penBodies.get('ai');
    
    if (playerPen) {
      Body.setPosition(playerPen.body, { x: deskX + 80, y: deskY + deskHeight / 2 });
      Body.setVelocity(playerPen.body, { x: 0, y: 0 });
      Body.setAngularVelocity(playerPen.body, 0);
      Body.setAngle(playerPen.body, 0);
    }
    
    if (aiPen) {
      Body.setPosition(aiPen.body, { x: deskX + deskWidth - 80, y: deskY + deskHeight / 2 });
      Body.setVelocity(aiPen.body, { x: 0, y: 0 });
      Body.setAngularVelocity(aiPen.body, 0);
      Body.setAngle(aiPen.body, Math.PI);
    }
  }
  
  // Place a pen at rest at an exact position, e.g. to match the authoritative
  // state sent by the other player in an online match
  setPenState(isPlayer: boolean, state: { x: number; y: number; angle: number }) {
    const penData = this.penBodies.get(isPlayer ? 'player' : 'ai');
    if (!penData) return;
    Body.setPosition(penData.body, { x: state.x, y: state.y });
    Body.setAngle(penData.body, state.angle);
    Body.setVelocity(penData.body, { x: 0, y: 0 });
    Body.setAngularVelocity(penData.body, 0);
  }

  destroy() {
    Events.off(this.engine, 'collisionStart', this.handleCollision.bind(this));
    World.clear(this.engine.world, false);
    Engine.clear(this.engine);
  }
}
