import { Boss } from './Boss.js';
import { Enemy } from './BaseEnemy.js';
import { AetherSentinel } from './AetherSentinel.js';
import { getCachedImage } from '../utils.js';
import { spawnProjectile, spawnExplosion } from '../skills/common.js';

class AetherDrone extends Enemy {
    constructor(game, owner, index) {
        const droneHp = 150;
        const droneSpeed = 220; // Match rush speed
        super(game, 0, 0, 24, 24, '#00ffff', droneHp, droneSpeed, null, 0);
        this.width = 24;
        this.height = 24;
        this.isSpawning = false;

        this.owner = owner;
        this.index = index;
        this.image = owner.bitImage;
        this.isDrone = true;
        this.isBoss = false;
        this.canDrop = false;
        this.currentAngleForDraw = 0;

        // Rush mechanics
        this.state = 'orbit'; // 'orbit', 'rush', 'return'
        this.isShielded = false;
        this.vx = 0;
        this.vy = 0;
        this.rushSpeed = 220;
        this.hitCooldown = 0;
    }

    update(dt) {
        if (!this.owner || this.owner.markedForDeletion) {
            this.markedForDeletion = true;
            return;
        }

        if (this.state === 'rush') {
            // Manual movement for bouncing projectiles (superUpdate stops at walls)
            this.x += this.vx * dt;
            this.y += this.vy * dt;

            // Wall Bounce
            if (this.game && this.game.map) {
                if (this.game.map.isWall(this.x, this.y) || this.game.map.isWall(this.x + this.width, this.y) ||
                    this.game.map.isWall(this.x, this.y + this.height) || this.game.map.isWall(this.x + this.width, this.y + this.height)) {

                    const cx = this.x + this.width / 2;
                    const cy = this.y + this.height / 2;
                    if (this.game.map.isWall(this.x, cy) || this.game.map.isWall(this.x + this.width, cy)) this.vx *= -1;
                    if (this.game.map.isWall(cx, this.y) || this.game.map.isWall(cx, this.y + this.height)) this.vy *= -1;

                    // Unstuck
                    this.x += this.vx * dt;
                    this.y += this.vy * dt;
                }
            }

            // Player Collision (Direct Damage)
            if (this.hitCooldown > 0) {
                this.hitCooldown -= dt;
            } else if (this.game.player) {
                const dist = Math.hypot((this.x + this.width / 2) - (this.game.player.x + this.game.player.width / 2),
                    (this.y + this.height / 2) - (this.game.player.y + this.game.player.height / 2));
                if (dist < 25) {
                    this.game.player.takeDamage(15);
                    this.hitCooldown = 0.5;
                }
            }

            this.currentAngleForDraw = Math.atan2(this.vy, this.vx);
            this.statusManager.update(dt);
            if (this.flashTimer > 0) this.flashTimer -= dt; // Ensure flash timer clears during rush
            // Bypass friction and superUpdate in rush mode to maintain speed and bounce
        } else if (this.state === 'sweep_move') {
            const dx = this.sweepTarget.x - (this.x + this.width / 2);
            const dy = this.sweepTarget.y - (this.y + this.height / 2);
            const dist = Math.hypot(dx, dy);

            // Smoother movement using lerp and deceleration
            if (dist > 2) {
                const lerpFactor = 5.0 * dt;
                this.x += dx * Math.min(1.0, lerpFactor);
                this.y += dy * Math.min(1.0, lerpFactor);
                this.currentAngleForDraw = Math.atan2(dy, dx);
            } else {
                this.vx = 0;
                this.vy = 0;
                this.state = 'sweep_aim';
                // Lock initial angle to player
                if (this.game && this.game.player) {
                    const pdx = this.game.player.x - (this.x + this.width / 2);
                    const pdy = this.game.player.y - (this.y + this.height / 2);
                    this.currentAngleForDraw = Math.atan2(pdy, pdx);
                    this.sweepLockedAngle = this.currentAngleForDraw;
                }
            }
            this.statusManager.update(dt);
            if (this.flashTimer > 0) this.flashTimer -= dt;
        } else if (this.state === 'sweep_aim') {
            // Keep fixed direction
            this.currentAngleForDraw = this.sweepLockedAngle;
            this.statusManager.update(dt);
            if (this.flashTimer > 0) this.flashTimer -= dt;
        } else if (this.state === 'sweep_beam') {
            this.sweepTimer -= dt;
            const progress = 1.0 - (this.sweepTimer / this.sweepMaxTimer);
            // Slowly rotate from the locked start angle
            this.currentAngleForDraw = this.sweepStartAngle + (this.sweepAngleRange * progress * this.sweepDirection);

            if (this.game && this.game.player) {
                const bx = this.x + this.width / 2;
                const by = this.y + this.height / 2;
                const beamLength = 800;
                const x2 = bx + Math.cos(this.currentAngleForDraw) * beamLength;
                const y2 = by + Math.sin(this.currentAngleForDraw) * beamLength;

                if (this.owner.checkBeamHit(this.game.player.x + this.game.player.width / 2, this.game.player.y + this.game.player.height / 2, 15, bx, by, x2, y2, 20)) {
                    this.game.player.takeDamage(10);
                }
            }

            if (this.sweepTimer <= 0) {
                this.state = 'return';
            }
            this.statusManager.update(dt);
            if (this.flashTimer > 0) this.flashTimer -= dt;
        } else {
            if (this.state === 'return') {
                const targetX = this.owner.x + this.owner.width / 2 - this.width / 2;
                const targetY = this.owner.y + this.owner.height / 2 - this.height / 2;
                const dx = targetX - this.x;
                const dy = targetY - this.y;
                const dist = Math.hypot(dx, dy);

                if (dist < 10) {
                    this.state = 'orbit';
                    this.isShielded = false;
                    this.vx = 0;
                    this.vy = 0;
                } else {
                    const speed = 600;
                    this.vx = (dx / dist) * speed;
                    this.vy = (dy / dist) * speed;
                    this.currentAngleForDraw = Math.atan2(this.vy, this.vx);
                }
            } else if (this.state === 'orbit') {
                this.vx = 0;
                this.vy = 0;
            }

            this.vx *= 0.95;
            this.vy *= 0.95;
            this.statusManager.update(dt);
            this.superUpdate(dt);
        }
        this.checkPlayerCollision();
    }

    takeDamage(amount, color, aether, crit, kx, ky, kd, silent, source) {
        if (this.isShielded) amount *= 0.5;
        const res = super.takeDamage(amount, color, aether, crit, 0, 0, kd, silent, source);
        if (this.hp <= 0) {
            spawnExplosion(this.game, this.x + this.width / 2, this.y + this.height / 2, '#00ffff', 0.5);
        }
        return res;
    }

    draw(ctx) {
        // Drone's draw is handled by AetherPrime for centralized control/flash support
    }
}

export class AetherPrime extends Boss {
    constructor(game, x, y) {
        super(game, x, y);
        this.width = 120;
        this.height = 120;
        this.hp = 2000;
        this.maxHp = 2000;
        this.speed = 15;
        this.displayName = "AETHER PRIME";
        this.score = 5000;

        this.floatPhase = 0;
        this.bitCount = 6;
        this.shieldAngle = 0;
        this.shieldRotationSpeed = 1.0;
        this.isOmniShield = true;

        this.attackCooldown = 5.0;
        this.phase = 1;
        this.stunTimer = 0;
        this.droneEntities = [];

        this.image = getCachedImage('assets/enemies/aether_prime/aether_prime.png');
        this.bitImage = getCachedImage('assets/enemies/aether_prime/aether_prime_drone.png');

        this.droneRushTimer = 0;
        this.spawnDrones();
    }

    spawnDrones() {
        // Clean up any existing drone references safely
        if (this.droneEntities) {
            this.droneEntities.forEach(d => {
                if (d) d.markedForDeletion = true;
            });
        }
        this.droneEntities = [];

        for (let i = 0; i < this.bitCount; i++) {
            const drone = new AetherDrone(this.game, this, i);
            if (this.game && this.game.enemies) {
                this.game.enemies.push(drone);
            }
            this.droneEntities.push(drone);
        }
    }

    update(dt) {
        if (this.isSpawning) {
            super.update(dt);
            return;
        }

        // Stun Logic
        if (this.stunTimer > 0) {
            this.stunTimer -= dt;
            this.vx = 0;
            this.vy = 0;
            this.isOmniShield = false;
            this.isTelegraphing = false;
            this.droneRushTimer = 0;
            this.floatPhase += dt * 0.5;

            if (this.stunTimer <= 0) {
                this.stunTimer = 0;
                this.isOmniShield = true;
                this.spawnDrones();
                if (this.game && this.game.logToScreen) {
                    this.game.logToScreen("AETHER PRIME RECOVERED!");
                }
            }
            return;
        }

        // Shield status check
        const aliveDrones = this.droneEntities.filter(d => d && !d.markedForDeletion);
        if (aliveDrones.length === 0 && this.stunTimer <= 0) {
            this.stunTimer = 15.0;
            if (this.game) {
                if (this.game.logToScreen) this.game.logToScreen("SHIELD DOWN! AETHER PRIME STUNNED!");
                if (this.game.camera) this.game.camera.shake(0.3, 10);
            }
            return;
        }
        this.isOmniShield = aliveDrones.length > 0;

        // Phase Transition
        if (this.phase === 1 && this.hp < this.maxHp * 0.5) {
            this.phase = 2;
            this.bitCount = 8;
            this.shieldRotationSpeed = 2.0;
            if (this.game) {
                if (this.game.camera) this.game.camera.shake(0.5, 15);
                if (this.game.logToScreen) this.game.logToScreen("AETHER PRIME OVERLOADED!");
                if (this.game.spawnParticles) {
                    this.game.spawnParticles(this.x + this.width / 2, this.y + this.height / 2, 50, '#00ffff');
                }
            }
            this.spawnDrones();
        }

        // Movement (Safety check for player)
        if (this.game && this.game.player) {
            const dx = this.game.player.x - this.x;
            const dy = this.game.player.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > 180) {
                this.vx += (dx / dist) * this.speed * dt * 2;
                this.vy += (dy / dist) * this.speed * dt * 2;
            } else if (dist < 120 && dist > 0) {
                this.vx -= (dx / dist) * this.speed * dt * 2;
                this.vy -= (dy / dist) * this.speed * dt * 2;
            }
        }

        // Safety: NaN guard for velocity
        if (isNaN(this.vx)) this.vx = 0;
        if (isNaN(this.vy)) this.vy = 0;
        this.vx *= 0.95;
        this.vy *= 0.95;

        this.floatPhase += dt * 2.0;
        this.shieldAngle += this.shieldRotationSpeed * dt;

        // Update Drones Swarm
        const time = Date.now() / 1000;
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;

        this.droneEntities.forEach((d, i) => {
            if (!d || d.markedForDeletion) return;
            d.update(dt); // Crucial: Call drone's specific update

            if (d.state === 'orbit') {
                // Erratic "Swarm" Movement Logic (縦横無尽)
                // Combine multiple sine/cosine waves with different frequencies and phases
                const baseAngle = (i / this.bitCount) * Math.PI * 2;
                const orbitSpeed = 0.8;

                // Angular oscillation
                const angleOffset = Math.sin(time * 1.2 + i * 0.5) * 0.5 + Math.cos(time * 0.7 - i) * 0.3;
                const angle = baseAngle + time * orbitSpeed + angleOffset;

                // Radial oscillation (drifting in and out)
                const baseDist = 100;
                const distOffset = Math.sin(time * 1.5 + i * 1.5) * 40 + Math.cos(time * 0.5 + i) * 20;
                const orbitDist = baseDist + distOffset;

                // Small erratic floating
                const floatX = Math.sin(time * 3.5 + i * 2) * 20;
                const floatY = Math.cos(time * 2.8 + i * 3) * 20;

                const targetX = cx + Math.cos(angle) * orbitDist + floatX - d.width / 2;
                const targetY = cy + Math.sin(angle) * orbitDist + floatY - d.height / 2;

                // Smooth interpolation to target to make it feel "active" but not teleporting
                const lerpFactor = 5.0 * dt;
                d.x += (targetX - d.x) * Math.min(1.0, lerpFactor);
                d.y += (targetY - d.y) * Math.min(1.0, lerpFactor);

                // Direction Logic
                if (this.isTelegraphing && this.currentAttack === 'syncShot') {
                    // Aim at player during telegraph
                    if (this.game && this.game.player) {
                        d.currentAngleForDraw = Math.atan2(this.game.player.y - (d.y + d.height / 2), this.game.player.x - (d.x + d.width / 2));
                    }
                } else {
                    // Face "forward" in its orbit/drift path
                    d.currentAngleForDraw = angle + Math.PI / 2 + angleOffset;
                }
            }
        });

        // Drone Rush Timer
        if (this.droneRushTimer > 0) {
            this.droneRushTimer -= dt;
            if (this.droneRushTimer <= 0) {
                this.droneEntities.forEach(d => {
                    if (d && !d.markedForDeletion) d.state = 'return';
                });
            }
        }

        // Sync Shot Charging VFX
        if (this.isTelegraphing && this.currentAttack === 'syncShot' && this.game) {
            this.droneEntities.forEach((d, i) => {
                if (!d || d.markedForDeletion) return;
                if (Math.random() < 0.2) {
                    const dcx = d.x + d.width / 2;
                    const dcy = d.y + d.height / 2;
                    this.game.spawnParticles(dcx, dcy, 1, '#00ffff', (Math.random() - 0.5) * 50, (Math.random() - 0.5) * 50, { size: 2 });
                }
            });
        }

        // Beam Charging VFX
        if (this.isTelegraphing && this.currentAttack === 'beam' && this.game) {
            const chargeProgress = 1.0 - (this.telegraphTimer / 1.5);
            if (Math.random() < 0.3 + chargeProgress * 0.4) {
                const angle = Math.random() * Math.PI * 2;
                const d = 60 + Math.random() * 60;
                this.game.animations.push({
                    type: 'particle',
                    x: cx + Math.cos(angle) * d,
                    y: cy + Math.sin(angle) * d,
                    targetX: cx, targetY: cy,
                    life: 0.4, maxLife: 0.4,
                    color: '#00ffff',
                    speed: 5 + chargeProgress * 10,
                    update: function (dt) {
                        this.life -= dt;
                        const dx = this.targetX - this.x;
                        const dy = this.targetY - this.y;
                        this.x += dx * this.speed * dt;
                        this.y += dy * this.speed * dt;
                    },
                    draw: function (ctx) {
                        ctx.fillStyle = this.color;
                        ctx.globalAlpha = this.life / this.maxLife;
                        ctx.fillRect(this.x, this.y, 3, 3);
                    }
                });
            }
        }

        // Boss logic (Attacks, decideAttack) - Handle Telegraphing manually after bypassing Enemy.update
        if (this.isTelegraphing) {
            this.telegraphTimer -= dt;
            this.vx = 0;
            this.vy = 0;
            if (this.telegraphTimer <= 0) {
                this.isTelegraphing = false;
                this.executeAttack();
            }
        } else {
            // Special check for Drone Sweep deployment
            if (this.currentAttack === 'droneSweep') {
                const sweepDrones = this.droneEntities.filter(d => d.state === 'sweep_move' || d.state === 'sweep_aim');
                if (sweepDrones.length > 0 && sweepDrones.every(d => d.state === 'sweep_aim')) {
                    // All drones reached target, start telegraphing for fire
                    this.startTelegraph(1.5);
                }
            } else {
                this.attackCooldown -= dt;
                if (this.attackCooldown <= 0) {
                    this.decideAttack();
                }
            }
        }
        this.updateAnimation(dt);
        this.auraTimer += dt;
        this.flashTimer = Math.max(0, (this.flashTimer || 0) - dt);

        this.vx *= 0.95;
        this.vy *= 0.95;
        const currentSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        const maxSpeed = 300;
        if (currentSpeed > maxSpeed) {
            this.vx = (this.vx / currentSpeed) * maxSpeed;
            this.vy = (this.vy / currentSpeed) * maxSpeed;
        }

        this.statusManager.update(dt);
        this.superUpdate(dt);
    }

    decideAttack() {
        if (this.stunTimer > 0 || this.droneRushTimer > 0) return;

        let picked = 'summon';
        const r = Math.random();
        if (this.phase === 1) {
            if (r < 0.2) picked = 'summon';
            else if (r < 0.4) picked = 'syncShot';
            else if (r < 0.65) picked = 'droneRush';
            else if (r < 0.9) picked = 'droneSweep';
            else picked = 'beam';
        } else {
            if (r < 0.1) picked = 'summon';
            else if (r < 0.25) picked = 'nova';
            else if (r < 0.45) picked = 'syncShot';
            else if (r < 0.7) picked = 'droneRush';
            else if (r < 0.9) picked = 'droneSweep';
            else picked = 'beam';
        }

        this.currentAttack = picked;
        if (picked === 'beam') {
            this.beamTargetAngle = null;
            this.startTelegraph(1.5);
        } else if (picked === 'nova' || picked === 'droneRush') {
            this.startTelegraph(1.2);
        } else if (picked === 'syncShot') {
            this.startTelegraph(1.5);
        } else if (picked === 'droneSweep') {
            // Only trigger movement phase
            this.attackDroneSweep();
        } else {
            this.executeAttack();
        }
    }

    executeAttack() {
        if (this.stunTimer > 0) return;

        if (this.currentAttack === 'beam') this.attackBeam();
        else if (this.currentAttack === 'nova') this.attackNova();
        else if (this.currentAttack === 'summon') this.attackSummon();
        else if (this.currentAttack === 'syncShot') this.attackSyncShot();
        else if (this.currentAttack === 'droneRush') this.attackDroneRush();
        else if (this.currentAttack === 'droneSweep') this.executeSweepBeams();

        this.attackCooldown = 3.0; // Fixed aggressive cooldown
    }

    attackSyncShot() {
        if (!this.game || !this.game.player) return;
        this.droneEntities.forEach(d => {
            if (!d || d.markedForDeletion) return;
            const dcx = d.x + d.width / 2;
            const dcy = d.y + d.height / 2;
            const angle = Math.atan2(this.game.player.y - dcy, this.game.player.x - dcx);
            this.spawnOrb(dcx, dcy, angle, { speed: 500, size: 50, color: '#00ffff', damage: 10, isBeam: true });
        });
    }

    attackDroneRush() {
        if (!this.game || !this.game.player) return;
        this.droneRushTimer = 10.0;
        this.droneEntities.forEach((d, i) => {
            if (!d || d.markedForDeletion) return;
            d.state = 'rush';
            d.isShielded = true;

            // Random direction outward initially
            const angle = (i / this.bitCount) * Math.PI * 2 + Math.random() * 0.5;
            d.vx = Math.cos(angle) * d.rushSpeed;
            d.vy = Math.sin(angle) * d.rushSpeed;
        });
        if (this.game.logToScreen) this.game.logToScreen("DRONE RUSH INITIATED!");
    }

    attackNova() {
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        for (let i = 0; i < 12; i++) {
            this.spawnOrb(cx, cy, (i / 12) * Math.PI * 2);
        }
    }

    attackDroneSweep() {
        if (!this.game || !this.game.player) return;
        const drones = this.droneEntities.filter(d => d && !d.markedForDeletion);
        if (drones.length === 0) {
            this.decideAttack();
            return;
        }

        const count = Math.min(3, drones.length);
        const shuffled = [...drones].sort(() => 0.5 - Math.random());
        const sweepDrones = shuffled.slice(0, count);

        // DO NOT start telegraph here anymore. Let drones reach 'sweep_aim' phase first.
        sweepDrones.forEach(d => {
            d.state = 'sweep_move';
            const margin = 60; // Margin from room walls
            const tileSize = this.game.map.tileSize || 40;

            // Try to find the boss room or default to a range around the boss
            const bossRoom = this.game.map.rooms.find(r => r.type === 'boss');
            let tx, ty;
            let attempts = 0;

            if (bossRoom) {
                const minX = bossRoom.x * tileSize + margin;
                const minY = bossRoom.y * tileSize + margin;
                const maxX = (bossRoom.x + bossRoom.w) * tileSize - margin;
                const maxY = (bossRoom.y + bossRoom.h) * tileSize - margin;

                do {
                    tx = minX + Math.random() * (maxX - minX);
                    ty = minY + Math.random() * (maxY - minY);
                    attempts++;
                } while (this.game.map.isWall(tx, ty) && attempts < 20);
            } else {
                // Fallback: 350px around the boss
                const range = 350;
                do {
                    tx = (this.x + this.width / 2) + (Math.random() - 0.5) * range * 2;
                    ty = (this.y + this.height / 2) + (Math.random() - 0.5) * range * 2;
                    attempts++;
                } while (this.game.map.isWall(tx, ty) && attempts < 20);
            }

            d.sweepTarget = { x: tx, y: ty };
            d.sweepMoveSpeed = 400;
        });
        if (this.game.logToScreen) this.game.logToScreen("DRONES DEPLOYING FOR SWEEP!");
    }

    executeSweepBeams() {
        const drones = this.droneEntities.filter(d => d && !d.markedForDeletion && d.state === 'sweep_aim');
        const direction = Math.random() < 0.5 ? 1 : -1;
        const sweepAngle = (60 * Math.PI) / 180;
        const duration = 2.0; // Slower sweep

        drones.forEach(d => {
            d.state = 'sweep_beam';
            d.sweepStartAngle = d.sweepLockedAngle;
            d.sweepDirection = direction;
            d.sweepTimer = duration;
            d.sweepMaxTimer = duration;
            d.sweepAngleRange = sweepAngle;
        });
        if (this.game.logToScreen) this.game.logToScreen("SWEEP BEAMS ACTIVE!");
        this.currentAttack = null; // Clear attack state to allow cooldown to start
    }

    attackBeam() {
        if (!this.game || !this.game.player) return;
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const targetAngle = this.beamTargetAngle !== null ? this.beamTargetAngle : Math.atan2(this.game.player.y - cy, this.game.player.x - cx);
        const beamLength = 800;
        const x2 = cx + Math.cos(targetAngle) * beamLength;
        const y2 = cy + Math.sin(targetAngle) * beamLength;
        const beamWidth = 40;

        if (this.checkBeamHit(this.game.player.x + this.game.player.width / 2, this.game.player.y + this.game.player.height / 2, 15, cx, cy, x2, y2, beamWidth)) {
            this.game.player.takeDamage(40);
        }

        this.game.animations.push({
            type: 'flash_line',
            x1: cx, y1: cy, x2: x2, y2: y2, width: beamWidth,
            color: '#00ffff', life: 0.5, maxLife: 0.5,
            draw: function (ctx) {
                const alpha = this.life / this.maxLife;
                ctx.save();
                const grad = ctx.createLinearGradient(this.x1, this.y1, this.x2, this.y2);
                const shift = (Date.now() / 150) % 1.0;
                grad.addColorStop(0, '#00ffff');
                grad.addColorStop((0.2 + shift) % 1.0, '#ffffff');
                grad.addColorStop((0.5 + shift) % 1.0, '#00eeff');
                grad.addColorStop((0.8 + shift) % 1.0, '#ffffff');
                grad.addColorStop(1, '#00ffff');
                ctx.globalAlpha = alpha;
                ctx.strokeStyle = grad;
                ctx.lineWidth = this.width * (0.8 + Math.sin(Date.now() / 40) * 0.2);
                ctx.beginPath();
                ctx.moveTo(this.x1, this.y1); ctx.lineTo(this.x2, this.y2);
                ctx.stroke();
                ctx.restore();
            }
        });
    }

    checkBeamHit(px, py, pr, x1, y1, x2, y2, beamWidth) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) return false;
        const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
        const closestX = x1 + t * dx;
        const closestY = y1 + t * dy;
        return (px - closestX) ** 2 + (py - closestY) ** 2 < (pr + beamWidth / 2) ** 2;
    }

    attackSummon() {
        if (!this.game || !this.game.enemies || !this.game.map) return;
        const sentinels = this.game.enemies.filter(e => e instanceof AetherSentinel && !e.markedForDeletion);
        const limit = this.phase === 1 ? 2 : 4;
        if (sentinels.length < limit) {
            const offset = 120;
            const points = [
                { x: this.x - offset, y: this.y }, { x: this.x + this.width + offset, y: this.y },
                { x: this.x, y: this.y - offset }, { x: this.x, y: this.y + this.height + offset }
            ];
            let spawned = 0;
            for (const pt of points) {
                if (spawned >= Math.min(2, limit - sentinels.length)) break;
                if (!this.game.map.isWall(pt.x + 15, pt.y + 15)) {
                    const s = new AetherSentinel(this.game, pt.x, pt.y);
                    s.canDrop = false;
                    this.game.enemies.push(s);
                    spawned++;
                }
            }
        }
    }

    spawnOrb(x, y, angle, options = {}) {
        if (!this.game || !this.game.enemyProjectiles) return;
        const speed = options.speed || 200;
        const size = options.size || 25;
        const damage = options.damage || 20;
        const color = options.color || '#00ffff';

        this.game.enemyProjectiles.push({
            x: x, y: y,
            vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
            width: size, height: size, damage: damage, life: 5.0, color: color,
            update: function (dt, game) {
                this.x += this.vx * dt; this.y += this.vy * dt;
                this.life -= dt;
                if (game.player && Math.hypot(game.player.x - this.x, game.player.y - this.y) < size * 0.8) {
                    game.player.takeDamage(this.damage);
                    this.life = 0;
                }
            },
            draw: function (ctx) {
                ctx.save();
                ctx.translate(this.x, this.y);
                ctx.rotate(Math.atan2(this.vy, this.vx));

                ctx.fillStyle = this.color;
                ctx.shadowBlur = 10;
                ctx.shadowColor = this.color;

                if (options.isBeam) {
                    // Slender rectangle shape (Longer and Thinner)
                    const length = size;
                    const thickness = 3;
                    ctx.fillRect(-length / 2, -thickness / 2, length, thickness);

                    // Core white line
                    ctx.fillStyle = '#fff';
                    ctx.fillRect(-length / 2, -thickness / 4, length, thickness / 2);
                } else {
                    ctx.beginPath();
                    ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
                    ctx.fill();
                }

                ctx.restore();
            }
        });
    }

    takeDamage(amount, color, aether, crit, kx, ky, kd, silent, source) {
        if (this.isOmniShield) amount *= 0.2;
        return super.takeDamage(amount, color, aether, crit, 0, 0, kd, silent, source);
    }

    draw(ctx) {
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;

        ctx.save();
        ctx.translate(cx, cy);
        let rotationAngle = (this.floatPhase || 0) * 0.5;

        if (this.isTelegraphing && this.currentAttack === 'beam' && this.stunTimer <= 0) {
            const chargeProgress = 1.0 - (this.telegraphTimer / 1.5);
            rotationAngle = (Date.now() / 1000) * (0.5 + Math.pow(chargeProgress, 2) * 35.0);
            const pulse = 1.0 + Math.sin(Date.now() / 20) * 0.15 * chargeProgress;
            ctx.scale(pulse, pulse);

            const orbSize = 5 + chargeProgress * 30;
            const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, orbSize);
            grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.5, '#00ffff'); grad.addColorStop(1, 'rgba(0, 255, 255, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath(); ctx.arc(0, 0, orbSize, 0, Math.PI * 2); ctx.fill();
        }

        ctx.rotate(rotationAngle);
        if (this.image && this.image.complete) {
            if (this.stunTimer > 0) ctx.filter = 'grayscale(100%) opacity(70%)';
            if (this.flashTimer > 0) ctx.filter = 'brightness(0) invert(1)';
            ctx.drawImage(this.image, -this.width / 2, -this.height / 2, this.width, this.height);
            ctx.filter = 'none';
        } else {
            ctx.fillStyle = '#006666';
            ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
        }
        ctx.restore();

        // Draw Drones
        if (this.droneEntities) {
            this.droneEntities.forEach((d, i) => {
                if (!d || d.markedForDeletion) return;
                ctx.save();
                ctx.translate(d.x + d.width / 2, d.y + d.height / 2);

                const targetAngle = d.currentAngleForDraw || 0;
                ctx.rotate(targetAngle);

                // --- Attack Highlight & Telegraph ---
                const isAttacking = (this.isTelegraphing && (this.currentAttack === 'syncShot' || this.currentAttack === 'droneRush' || this.currentAttack === 'droneSweep'));
                if (isAttacking) {
                    const pulse = 0.5 + Math.sin(Date.now() / 100) * 0.5;
                    ctx.shadowBlur = 15 * pulse;
                    ctx.shadowColor = '#00ffff';
                    ctx.fillStyle = `rgba(0, 255, 255, ${0.3 * pulse})`;
                    ctx.beginPath();
                    ctx.arc(0, 0, 20, 0, Math.PI * 2);
                    ctx.fill();

                    // Drone Sweep Telegraph Line (Red)
                    if (this.currentAttack === 'droneSweep' && (d.state === 'sweep_move' || d.state === 'sweep_aim')) {
                        ctx.fillStyle = (d.state === 'sweep_aim') ? 'rgba(255, 0, 0, 0.4)' : 'rgba(255, 0, 0, 0.15)';
                        ctx.fillRect(0, -5, 800, 10); // Thinner telegraph line
                    }
                }

                // --- Drone Sweep Beam (Active Fire) ---
                if (d.state === 'sweep_beam') {
                    const beamLength = 800;
                    const thickness = 20;
                    const grad = ctx.createLinearGradient(0, 0, beamLength, 0);
                    grad.addColorStop(0, '#00ffff');
                    grad.addColorStop(1, 'rgba(0, 255, 255, 0)');
                    ctx.fillStyle = grad;
                    ctx.globalAlpha = 0.6 + Math.sin(Date.now() / 50) * 0.2;
                    ctx.fillRect(0, -thickness / 2, beamLength, thickness);

                    // Core white line
                    ctx.fillStyle = '#fff';
                    ctx.fillRect(0, -thickness / 6, beamLength, thickness / 3);
                    ctx.globalAlpha = 1.0;
                    ctx.shadowBlur = 0;
                }

                // --- Draw Drone Sprite (Rotate PI/2 for sprite orientation) ---
                ctx.rotate(Math.PI / 2);
                const isSweeping = (this.currentAttack === 'droneSweep' && (d.state === 'sweep_move' || d.state === 'sweep_beam'));
                if (!isSweeping && this.currentAttack !== 'syncShot' && this.currentAttack !== 'droneRush') {
                    // Small cosmetic bobbing if idle
                    ctx.rotate(Math.sin(Date.now() / 1000 + i) * 0.3);
                }

                if (this.bitImage && this.bitImage.complete && this.bitImage.naturalWidth !== 0) {
                    if (d.flashTimer > 0) ctx.filter = 'brightness(0) invert(1)';
                    ctx.drawImage(this.bitImage, -12, -12, 24, 24);
                    ctx.filter = 'none';

                    // Shield if active
                    if (d.isShielded) {
                        ctx.beginPath();
                        ctx.arc(0, 0, 18, 0, Math.PI * 2);
                        ctx.strokeStyle = 'rgba(0, 255, 255, 0.5)';
                        ctx.lineWidth = 2;
                        ctx.stroke();
                        const sGrad = ctx.createRadialGradient(0, 0, 12, 0, 0, 18);
                        sGrad.addColorStop(0, 'rgba(0, 255, 255, 0)');
                        sGrad.addColorStop(1, 'rgba(0, 255, 255, 0.2)');
                        ctx.fillStyle = sGrad;
                        ctx.fill();
                    }
                } else {
                    ctx.fillStyle = '#00ffff';
                    ctx.shadowBlur = 10;
                    ctx.shadowColor = '#00ffff';
                    ctx.beginPath();
                    ctx.arc(0, 0, 10, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.shadowBlur = 0;
                }
                ctx.restore();

                // --- Drone HP Bar ---
                if (d.hp < d.maxHp) {
                    const bw = 24;
                    const bh = 3;
                    const bx = d.x + d.width / 2 - bw / 2;
                    const by = d.y - 6;

                    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                    ctx.fillRect(bx, by, bw, bh);

                    const hpPct = Math.max(0, d.hp / d.maxHp);
                    ctx.fillStyle = '#ff3333';
                    ctx.fillRect(bx, by, bw * hpPct, bh);

                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                    ctx.lineWidth = 0.5;
                    ctx.strokeRect(bx, by, bw, bh);
                }
            });
        }

        if (this.isOmniShield) {
            const pulse = 1.0 + Math.sin(Date.now() / 200) * 0.05;
            const grad = ctx.createRadialGradient(cx, cy, 60, cx, cy, 100 * pulse);
            grad.addColorStop(0, 'rgba(0, 255, 255, 0)'); grad.addColorStop(1, 'rgba(0, 255, 255, 0.3)');
            ctx.fillStyle = grad;
            ctx.beginPath(); ctx.arc(cx, cy, 100 * pulse, 0, Math.PI * 2); ctx.fill();
        }

        if (this.isTelegraphing && this.currentAttack === 'beam' && this.game && this.game.player) {
            if (this.telegraphTimer > 0.5) {
                this.beamTargetAngle = Math.atan2(this.game.player.y - cy, this.game.player.x - cx);
            }
            ctx.save();
            ctx.translate(cx, cy); ctx.rotate(this.beamTargetAngle);
            ctx.fillStyle = `rgba(255, 0, 0, ${0.2 + Math.sin(Date.now() / 100) * 0.1})`;
            ctx.fillRect(0, -20, 800, 40);
            ctx.strokeStyle = 'rgba(255, 0, 0, 0.4)'; ctx.lineWidth = 1; ctx.setLineDash([10, 5]);
            ctx.strokeRect(0, -20, 800, 40);
            ctx.restore();
        }

    }
}
