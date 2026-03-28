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

export class GamePhysics {
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
        friction: playerPen.friction * 0.3, // More surface friction
        frictionAir: 0.06, // Much more air friction to reduce gliding
        frictionStatic: 0.8, // High static friction
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
        friction: aiPen.friction * 0.3, // More surface friction
        frictionAir: 0.06, // Much more air friction to reduce gliding
        frictionStatic: 0.8, // High static friction
        restitution: 0.5, // Less bouncy
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
    
    // Calculate torque based on where the hit point is relative to center
    const hitOffset = Vector.sub(hitPoint, penCenter);
    const hitDistance = Vector.magnitude(hitOffset);
    const maxDistance = 35; // Half pen length
    
    // The further from center, the more spin (clamped)
    const normalizedHitDistance = Math.min(hitDistance / maxDistance, 1);
    const spinFactor = normalizedHitDistance * pen.rotationSpeed;
    
    // Calculate perpendicular direction for spin
    const forceMag = Vector.magnitude(force);
    if (forceMag < 0.1) return; // Too weak, ignore
    
    const forceDirection = Vector.normalise(force);
    
    // Determine spin direction based on which side of center was hit
    const crossProduct = hitOffset.x * forceDirection.y - hitOffset.y * forceDirection.x;
    const spinDirection = crossProduct > 0 ? 1 : -1;
    
    // Apply angular velocity (spin) - stronger effect
    const angularVelocity = spinFactor * spinDirection * 0.15 * powerMultiplier;
    Body.setAngularVelocity(body, angularVelocity);
    
    // Apply linear velocity - limit max speed to prevent tunneling
    const velocityScale = 0.8 * powerMultiplier;
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
    
    console.log('Flick applied:', { velocity, angularVelocity, hitDistance, spinFactor });
  }
  
  update(deltaTime: number) {
    // Use smaller sub-steps for better collision detection
    const subSteps = 3;
    const subDelta = deltaTime / subSteps;
    
    for (let i = 0; i < subSteps; i++) {
      Engine.update(this.engine, subDelta);
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
  
  destroy() {
    Events.off(this.engine, 'collisionStart', this.handleCollision.bind(this));
    World.clear(this.engine.world, false);
    Engine.clear(this.engine);
  }
}
