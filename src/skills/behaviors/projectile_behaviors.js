import { spawnExplosion, spawnIceShatter, spawnProjectile, spawnLightningBurst, spawnBounceSparkImpact } from '../common.js';
import { getCachedImage } from '../../utils.js';

export const projectileBehaviors = {
    'projectile': (user, game, params) => {
        let vx = 0, vy = 0;
        let w = params.width || params.size || 10;
        let h = params.height || params.size || 10;

        // Facing Logic
        // Facing Logic
        let dirX = 0, dirY = 0;
        if (user.facing === 'left') dirX = -1;
        else if (user.facing === 'right') dirX = 1;
        else if (user.facing === 'up') dirY = -1;
        else if (user.facing === 'down') dirY = 1;
        else if (user.facing === 'up-left') { dirX = -0.707; dirY = -0.707; }
        else if (user.facing === 'up-right') { dirX = 0.707; dirY = -0.707; }
        else if (user.facing === 'down-left') { dirX = -0.707; dirY = 0.707; }
        else if (user.facing === 'down-right') { dirX = 0.707; dirY = 0.707; }

        vx = dirX * params.speed;
        vy = dirY * params.speed;

        if (dirY !== 0 && dirX === 0) {
            if (!params.fixedOrientation && params.width && params.height) { let temp = w; w = h; h = temp; }
        }

        const projParams = { ...params };
        if (dirY !== 0 && dirX === 0) {
            projParams.width = w;
            projParams.height = h;
        }

        // Offset Logic
        const forward = params.forwardOffset || 0;
        const side = params.sideOffset || 0;
        const height = params.heightOffset || 0;

        let spawnX = user.x + user.width / 2;
        let spawnY = user.y + user.height / 2;

        // Apply Offsets based on facing
        // Apply Offsets based on facing
        if (user.facing === 'left') { spawnX -= forward; spawnY += side; }
        else if (user.facing === 'right') { spawnX += forward; spawnY += side; }
        else if (user.facing === 'up') { spawnY -= forward; spawnX += side; }
        else if (user.facing === 'down') { spawnY += forward; spawnX += side; }
        else if (user.facing === 'up-left') { spawnX -= forward * 0.707; spawnY -= forward * 0.707; }
        else if (user.facing === 'up-right') { spawnX += forward * 0.707; spawnY -= forward * 0.707; }
        else if (user.facing === 'down-left') { spawnX -= forward * 0.707; spawnY += forward * 0.707; }
        else if (user.facing === 'down-right') { spawnX += forward * 0.707; spawnY += forward * 0.707; }

        spawnY += height; // Absolute height offset (usually negative for "up")

        spawnProjectile(game, spawnX, spawnY, vx, vy, projParams);
    },

    'fan_projectile': (user, game, params) => {
        // "Shotgun" style spread
        const count = params.count || 5;
        const angleSpread = params.angleSpread || 30; // Total degrees
        const baseSpeed = params.speed || 400;
        const randomSpeed = params.randomSpeed || 0;

        // Determine base angle
        // Determine base angle
        let baseAngle = 0;
        if (user.facing === 'right') baseAngle = 0;
        else if (user.facing === 'down') baseAngle = Math.PI / 2;
        else if (user.facing === 'left') baseAngle = Math.PI;
        else if (user.facing === 'up') baseAngle = -Math.PI / 2;
        else if (user.facing === 'up-right') baseAngle = -Math.PI / 4;
        else if (user.facing === 'up-left') baseAngle = -3 * Math.PI / 4;
        else if (user.facing === 'down-right') baseAngle = Math.PI / 4;
        else if (user.facing === 'down-left') baseAngle = 3 * Math.PI / 4;

        // Convert spread to radians
        const spreadRad = angleSpread * (Math.PI / 180);
        const startAngle = baseAngle - spreadRad / 2;
        const step = spreadRad / (count - 1 || 1);

        // Center offsets
        const cx = user.x + user.width / 2;
        const cy = user.y + user.height / 2;

        for (let i = 0; i < count; i++) {
            // Apply angle
            const currentAngle = startAngle + step * i;

            // Vary speed
            const speed = baseSpeed + (Math.random() - 0.5) * randomSpeed;

            const vx = Math.cos(currentAngle) * speed;
            const vy = Math.sin(currentAngle) * speed;

            const proj = spawnProjectile(game, cx, cy, vx, vy, {
                ...params,
                vx: vx, vy: vy,
                life: params.life * (0.8 + Math.random() * 0.4), // Random life variation
                rotation: currentAngle
            });

            // Add custom particle emitter to ember/orb
            if (proj) {
                proj.update = function (dt) {
                    this.life -= dt;
                    this.x += this.vx * dt;
                    this.y += this.vy * dt;

                    // Wall Check 
                    if (game.map.isWall(this.x + this.w / 2, this.y + this.h / 2)) {
                        this.life = 0;
                        // On Wall Hit Effect - Explosion (Small)
                        spawnExplosion(game, this.x + this.w / 2, this.y + this.h / 2, params.color || 'orange', 0.25, 0.1);
                        return; // Stop processing to avoid double explosion from timeout check
                    }

                    // Timeout Check (End of Range)
                    if (this.life <= 0) {
                        spawnExplosion(game, this.x + this.w / 2, this.y + this.h / 2, params.color || 'orange', 0.25, 0.1);
                        return;
                    }

                    // Trail Particles
                    if (Math.random() < 0.3) {
                        game.animations.push({
                            type: 'particle',
                            x: this.x + this.w / 2,
                            y: this.y + this.h / 2,
                            w: 3, h: 3,
                            life: 0.3, maxLife: 0.3,
                            color: params.trailColor || 'orange',
                            vx: (Math.random() - 0.5) * 50,
                            vy: (Math.random() - 0.5) * 50
                        });
                    }
                };

                // On Enemy Hit Effect
                proj.onHitEnemy = function (enemy, gameInstance) {
                    // Critical hit roll
                    const isCrit = this.critChance > 0 && Math.random() < this.critChance;
                    const finalDamage = isCrit ? this.damage * (this.critMultiplier || 2.0) : this.damage;
                    enemy.takeDamage(finalDamage, params.damageColor, this.aetherCharge, isCrit);
                    // Expanding Circle Effect (Explosion) - Small & Light shake
                    spawnExplosion(gameInstance, this.x + this.w / 2, this.y + this.h / 2, params.color || 'orange', 0.25, 0.1);

                    this.life = 0; // Destroy on one hit
                };
            }
        }
    },

    'static_slash': (user, game, params) => {
        // Stationary slash that acts like a projectile but doesn't move
        // Rotation is determined by user facing
        let rotation = 0;
        let offsetX = 0;
        let offsetY = 0;
        const forward = params.forwardOffset || 40; // Default distance

        if (user.facing === 'right') { rotation = 0; offsetX = forward; }
        else if (user.facing === 'down') { rotation = Math.PI / 2; offsetY = forward; }
        else if (user.facing === 'left') { rotation = Math.PI; offsetX = -forward; }
        else if (user.facing === 'up') { rotation = -Math.PI / 2; offsetY = -forward; }
        else if (user.facing === 'up-right') { rotation = -Math.PI / 4; offsetX = forward * 0.7; offsetY = -forward * 0.7; }
        else if (user.facing === 'up-left') { rotation = -3 * Math.PI / 4; offsetX = -forward * 0.7; offsetY = -forward * 0.7; }
        else if (user.facing === 'down-right') { rotation = Math.PI / 4; offsetX = forward * 0.7; offsetY = forward * 0.7; }
        else if (user.facing === 'down-left') { rotation = 3 * Math.PI / 4; offsetX = -forward * 0.7; offsetY = forward * 0.7; }

        const spawnX = user.x + user.width / 2 + offsetX;
        const spawnY = user.y + user.height / 2 + offsetY;

        spawnProjectile(game, spawnX, spawnY, 0, 0, {
            ...params,
            vx: 0, vy: 0,
            rotation: rotation, // Pass explicit rotation
            rotationOffset: 0, // No extra offset needed usually
            fixedOrientation: true, // Tell renderer to use rotation
            noShake: true
        });
    },

    'crimson_cross': (user, game, params) => {
        // Two slashes crossed in an X shape - Staggered with Impact Effects
        let baseRotation = 0;
        let offsetX = 0;
        let offsetY = 0;
        const forward = params.forwardOffset || 40;

        if (user.facing === 'right') { baseRotation = 0; offsetX = forward; }
        else if (user.facing === 'down') { baseRotation = Math.PI / 2; offsetY = forward; }
        else if (user.facing === 'left') { baseRotation = Math.PI; offsetX = -forward; }
        else if (user.facing === 'up') { baseRotation = -Math.PI / 2; offsetY = -forward; }
        else if (user.facing === 'up-right') { baseRotation = -Math.PI / 4; offsetX = forward * 0.7; offsetY = -forward * 0.7; }
        else if (user.facing === 'up-left') { baseRotation = -3 * Math.PI / 4; offsetX = -forward * 0.7; offsetY = -forward * 0.7; }
        else if (user.facing === 'down-right') { baseRotation = Math.PI / 4; offsetX = forward * 0.7; offsetY = forward * 0.7; }
        else if (user.facing === 'down-left') { baseRotation = 3 * Math.PI / 4; offsetX = -forward * 0.7; offsetY = forward * 0.7; }

        const spawnX = user.x + user.width / 2 + offsetX;
        const spawnY = user.y + user.height / 2 + offsetY;

        const sequence = [
            { delay: 0, rot: Math.PI / 4, color: 'rgba(128, 0, 0, 0.5)' }, // Crimson variant
            { delay: 0.1, rot: -Math.PI / 4, color: 'rgba(200, 0, 0, 0.3)' } // Slightly brighter crimson
        ];

        sequence.forEach((strike) => {
            game.animations.push({
                type: 'logic',
                life: strike.delay + 0.05,
                timer: strike.delay,
                update: function (dt) {
                    this.timer -= dt;
                    if (this.timer <= 0 && !this.executed) {
                        this.executed = true;

                        // 1. Initial Impact Shake - REMOVED per user request
                        // game.camera.shake(0.1, 4); 

                        // 2. Spawn Slash
                        const finalRotation = baseRotation + strike.rot;
                        spawnProjectile(game, spawnX, spawnY, 0, 0, {
                            ...params,
                            rotation: finalRotation,
                            fixedOrientation: true,
                            noShake: true,
                            noHitParticles: true
                        });

                        // 3. Shockwave Ring (Matching crimson color)
                        game.animations.push({
                            type: 'ring',
                            x: spawnX, y: spawnY,
                            radius: 10,
                            maxRadius: 80,
                            width: 25,
                            life: 0.25,
                            maxLife: 0.25,
                            color: strike.color
                        });

                        // 4. Linear Particle Diffusion along the slash line
                        const span = params.height || 100;
                        for (let i = 0; i < 12; i++) {
                            const pDist = (Math.random() - 0.5) * span;
                            // Offset along the rotated slash axis (local Y axis in global space)
                            const px = spawnX + Math.cos(finalRotation + Math.PI / 2) * pDist;
                            const py = spawnY + Math.sin(finalRotation + Math.PI / 2) * pDist;

                            game.spawnParticles(px, py, 1, params.damageColor || '#800000');
                        }
                    }
                }
            });
        });
    },

    'lunatic_snicker_strike': (user, game, params) => {
        // Visual Impact: Initial Shake
        game.camera.shake(0.4, 8);

        // STAGGERED EXECUTION
        const strikeCount = user.isAetherRush ? 20 : 7;
        const radius = 250;
        const delayPerStrike = 0.03;

        for (let i = 0; i < strikeCount; i++) {
            const strikeDelay = i * delayPerStrike;

            game.animations.push({
                type: 'logic',
                life: strikeDelay + 0.01,
                timer: strikeDelay,
                update: function (dt) {
                    this.timer -= dt;
                    if (this.timer <= 0 && !this.executed) {
                        this.executed = true;

                        // Random position in radius around player
                        const angle = Math.random() * Math.PI * 2;
                        const dist = Math.random() * radius;
                        const spawnX = (user.x + user.width / 2) + Math.cos(angle) * dist;
                        const spawnY = (user.y + user.height / 2) + Math.sin(angle) * dist;

                        const baseRotation = Math.random() * Math.PI * 2;

                        // Single Slash
                        spawnProjectile(game, spawnX, spawnY, 0, 0, {
                            ...params,
                            rotation: baseRotation + Math.PI / 4,
                            fixedOrientation: true,
                            noShake: true
                        });

                        // Extra particle burst
                        game.spawnParticles(spawnX, spawnY, 10, params.damageColor);
                    }
                }
            });
        }
    },

    'bouncing_projectile': (user, game, params) => {
        let w = params.width || 10;
        let h = params.height || 10;
        const speed = params.speed || 400;

        // Directional Spread Fire
        let baseAngle = 0;
        if (user.facing === 'left') baseAngle = Math.PI;
        else if (user.facing === 'right') baseAngle = 0;
        else if (user.facing === 'up') baseAngle = -Math.PI / 2;
        else if (user.facing === 'down') baseAngle = Math.PI / 2;
        else if (user.facing === 'up-right') baseAngle = -Math.PI / 4;
        else if (user.facing === 'up-left') baseAngle = -3 * Math.PI / 4;
        else if (user.facing === 'down-right') baseAngle = Math.PI / 4;
        else if (user.facing === 'down-left') baseAngle = 3 * Math.PI / 4;

        const count = params.count || 5; // Default 5
        const spreadDeg = params.angleSpread || 15; // Default 15 degrees
        const spreadRad = spreadDeg * (Math.PI / 180);

        // Center the spread
        const startAngle = baseAngle - ((count - 1) * spreadRad) / 2;

        for (let i = 0; i < count; i++) {
            const angle = startAngle + i * spreadRad;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;

            // Custom update for bouncing
            const projParams = {
                ...params,
                life: params.life || 5.0,
                bounces: params.maxBounces || 5
            };

            const proj = {
                active: true,
                x: user.x + user.width / 2 - w / 2,
                y: user.y + user.height / 2 - h / 2,
                w: w, h: h,
                vx: vx, vy: vy,
                life: projParams.life,
                maxLife: projParams.life,
                color: params.color,
                color: params.color,
                damage: params.damage,
                damageColor: params.damageColor, // Pass damageColor
                aetherCharge: params.aetherCharge, // Pass charge
                bounces: projParams.bounces,
                trailColor: params.trailColor,
                shape: 'orb',

                update: function (dt) {
                    this.life -= dt;

                    // Prediction
                    const nextX = this.x + this.vx * dt;
                    const nextY = this.y + this.vy * dt;

                    // Wall Collision
                    if (game.map.isWall(nextX + this.w / 2, this.y + this.h / 2)) {
                        this.vx = -this.vx;
                        this.bounces--;
                        spawnBounceSparkImpact(game, this.x, this.y, params);
                    } else {
                        this.x = nextX;
                    }

                    if (game.map.isWall(this.x + this.w / 2, nextY + this.h / 2)) {
                        this.vy = -this.vy;
                        this.bounces--;
                        spawnBounceSparkImpact(game, this.x, this.y, params);
                    } else {
                        this.y = nextY;
                    }

                    if (this.bounces < 0) this.life = 0;

                    // Trail
                    if (Math.random() < 0.5) {
                        game.animations.push({
                            type: 'particle',
                            x: this.x + Math.random() * this.w,
                            y: this.y + Math.random() * this.h,
                            w: 4, h: 4,
                            life: 0.3, maxLife: 0.3,
                            color: this.trailColor || '#ffff00',
                            vx: 0, vy: 0
                        });
                    }

                    // Crackling Effect (Small lightning parts around orb)
                    if (Math.random() < 0.9) {
                        const count = 2;
                        for (let i = 0; i < count; i++) {
                            const offsetDist = this.w * 0.7;
                            const angle = Math.random() * Math.PI * 2;
                            const px = (this.x + this.w / 2) + Math.cos(angle) * offsetDist;
                            const py = (this.y + this.h / 2) + Math.sin(angle) * offsetDist;

                            const partId = Math.floor(Math.random() * 10) + 1;
                            const partStr = partId < 10 ? `0${partId}` : `${partId}`;
                            const spritePath = `assets/lightning_part_${partStr}.png`;

                            spawnProjectile(game, px, py, 0, 0, {
                                visual: true,
                                spriteSheet: spritePath,
                                frames: 1,
                                life: 0.1,
                                width: 15,
                                height: 15,
                                randomRotation: true,
                                rotation: Math.random() * Math.PI * 2,
                                color: '#a5f2f3',
                                blendMode: 'lighter',
                                noTrail: true
                            });
                        }
                    }
                },

                onHitEnemy: function (enemy, gameInstance) {
                    // 1. Deal Initial Hit (with crit)
                    const isCrit = this.critChance > 0 && Math.random() < this.critChance;
                    const finalDamage = isCrit ? this.damage * (this.critMultiplier || 2.0) : this.damage;
                    enemy.takeDamage(finalDamage, this.damageColor, this.aetherCharge, isCrit);
                    spawnBounceSparkImpact(gameInstance, this.x, this.y, params);

                    // 2. Spawn DoT Logic Object (if tickCount > 0)
                    const tickCount = params.tickCount || 0;
                    if (tickCount > 0) {
                        gameInstance.animations.push({
                            type: 'logic', // Invisible, logic-only
                            target: enemy,
                            damage: this.damage,
                            damageColor: this.damageColor, // Pass damageColor
                            aetherCharge: this.aetherCharge,
                            ticksRemaining: tickCount - 1, // First hit already done
                            timer: 0,
                            interval: params.tickInterval || 0.1,
                            life: (tickCount) * (params.tickInterval || 0.1) + 0.5, // Safety life
                            update: function (dt) {
                                if (this.ticksRemaining <= 0) return;

                                this.timer += dt;
                                if (this.timer >= this.interval) {
                                    this.timer -= this.interval;
                                    this.ticksRemaining--;

                                    if (this.target && !this.target.markedForDeletion) {
                                        this.target.takeDamage(this.damage, this.damageColor, this.aetherCharge);
                                        // Visual for tick
                                        gameInstance.spawnParticles(
                                            this.target.x + this.target.width / 2,
                                            this.target.y + this.target.height / 2,
                                            3, '#a5f2f3'
                                        );
                                    } else {
                                        this.ticksRemaining = 0; // Stop if target dead
                                    }
                                }
                            }
                        });
                    }

                    this.life = 0; // Destroy projectile
                }
            };
            game.projectiles.push(proj);
        }
    },

    'boomerang': (user, game, params) => {
        // Calculate initial velocity based on facing
        let vx = 0, vy = 0;
        const speed = params.speed || 600;
        if (user.facing === 'left') vx = -speed;
        else if (user.facing === 'right') vx = speed;
        else if (user.facing === 'up') vy = -speed;
        else if (user.facing === 'down') vy = speed;
        else if (user.facing === 'up-right') { vx = speed * 0.707; vy = -speed * 0.707; }
        else if (user.facing === 'up-left') { vx = -speed * 0.707; vy = -speed * 0.707; }
        else if (user.facing === 'down-right') { vx = speed * 0.707; vy = speed * 0.707; }
        else if (user.facing === 'down-left') { vx = -speed * 0.707; vy = speed * 0.707; }

        const w = params.width || 48;
        const h = params.height || 48;

        // Image Loading (Cached)
        const image = getCachedImage(params.spriteSheet || params.icon);

        const proj = {
            active: true,
            type: 'projectile',
            x: user.x + user.width / 2 - w / 2,
            y: user.y + user.height / 2 - h / 2,
            w: w, h: h,
            vx: vx, vy: vy,
            life: 5.0, // Safety max life
            damage: params.damage,
            aetherCharge: params.aetherCharge,
            color: params.color || 'red',
            image: image,
            rotation: 0,
            spinning: true, // Enable rotation override
            // Sprite Rendering Required Props
            frames: 1,
            frameX: 0,
            spriteFrames: null, // No JSON for this

            // State
            state: 0, // 0: Outward, 1: Return
            maxDist: params.range || 400,
            distTraveled: 0,
            owner: user, // Reference to catch

            update: function (dt) {
                // Rotation
                this.rotation += (params.rotationSpeed || 15) * dt;

                // Movement Logic
                if (this.state === 0) {
                    // Outward Phase
                    // Move
                    const dx = this.vx * dt;
                    const dy = this.vy * dt;
                    const nextX = this.x + dx;
                    const nextY = this.y + dy;

                    // Check Wall Collision
                    if (game.map.isWall(nextX + this.w / 2, nextY + this.h / 2)) {
                        this.state = 1; // Force Return
                        this.vx = 0;
                        this.vy = 0;
                    } else {
                        this.x = nextX;
                        this.y = nextY;
                        this.distTraveled += Math.sqrt(dx * dx + dy * dy);

                        if (this.distTraveled >= this.maxDist) {
                            this.state = 1;
                            this.vx = 0;
                            this.vy = 0;
                        }
                    }
                } else {
                    // Return Phase (ignores walls)
                    // Accelerate towards owner
                    const targetX = this.owner.x + this.owner.width / 2 - this.w / 2;
                    const targetY = this.owner.y + this.owner.height / 2 - this.h / 2;

                    const dx = targetX - this.x;
                    const dy = targetY - this.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    // Catch Check
                    if (dist < 30) {
                        this.life = 0; // Caught
                        return;
                    }

                    // Move towards owner
                    const returnSpeed = params.returnSpeed || 800; // Fast return
                    const dirX = dx / dist;
                    const dirY = dy / dist;

                    this.vx = dirX * returnSpeed;
                    this.vy = dirY * returnSpeed;

                    this.x += this.vx * dt;
                    this.y += this.vy * dt;
                }

                // Trail Effect (Ghost)
                if (Math.random() < 0.6) {
                    game.animations.push({
                        type: 'ghost',
                        x: this.x,
                        y: this.y,
                        w: this.w,
                        h: this.h,
                        life: 0.15, // Short life for blur
                        maxLife: 0.15,
                        color: params.trailColor || 'rgba(255, 0, 0, 0.5)',
                        // Pass Sprite Data
                        image: this.image,
                        frames: this.frames,
                        frameX: this.frameX,
                        rotation: this.rotation, // Pass current rotation
                        vx: 0, vy: 0
                    });
                }

                // Particle Effect (Red Spheres)
                if (Math.random() < 0.5) {
                    const size = Math.random() * 4 + 2; // 2-6px
                    game.animations.push({
                        type: 'particle', // generic particle
                        shape: 'circle',
                        x: this.x + this.w / 2 + (Math.random() - 0.5) * 20,
                        y: this.y + this.h / 2 + (Math.random() - 0.5) * 20,
                        w: size, h: size,
                        life: 0.3, maxLife: 0.3,
                        color: 'rgba(255, 50, 50, 0.8)',
                        vx: (Math.random() - 0.5) * 50,
                        vy: (Math.random() - 0.5) * 50
                    });
                }
            },

            // Allow checking for collision (infinite pierce usually implies not destroying on hit)
            pierce: params.pierce || 999
        };

        game.projectiles.push(proj);
    },

    'blood_scythe': (user, game, params) => {
        // Calculate initial velocity based on facing
        let directionX = 0, directionY = 0;
        if (user.facing === 'left') directionX = -1;
        else if (user.facing === 'right') directionX = 1;
        else if (user.facing === 'up') directionY = -1;
        else if (user.facing === 'down') directionY = 1;
        else if (user.facing === 'up-right') { directionX = 0.707; directionY = -0.707; }
        else if (user.facing === 'up-left') { directionX = -0.707; directionY = -0.707; }
        else if (user.facing === 'down-right') { directionX = 0.707; directionY = 0.707; }
        else if (user.facing === 'down-left') { directionX = -0.707; directionY = 0.707; }

        // Initial Speed setup
        const initialSpeed = params.speed || 800; // Fast out
        const acceleration = params.acceleration || -1200; // Slow down
        const returnSpeedMax = params.returnSpeed || 1500;

        const w = params.width || 48;
        const h = params.height || 48;

        // Image Loading (Cached)
        const imageSrc = params.spriteSheet || params.icon;
        const image = imageSrc ? getCachedImage(imageSrc) : null;

        const proj = {
            active: true,
            type: 'projectile',
            x: user.x + user.width / 2 - w / 2,
            y: user.y + user.height / 2 - h / 2,
            w: w, h: h,
            // Velocity components
            vx: directionX * initialSpeed,
            vy: directionY * initialSpeed,

            // State
            state: 0, // 0: Outward, 1: Return
            currentSpeed: initialSpeed,
            directionX: directionX,
            directionY: directionY,
            acceleration: acceleration,

            owner: user,
            maxDist: params.range || 800,
            distTraveled: 0,
            life: 10,

            damage: params.damage,
            aetherCharge: params.aetherCharge,
            statusEffect: params.statusEffect,
            statusChance: params.statusChance,
            color: params.color || 'red',
            image: image,
            rotation: 0,
            spinning: true,
            frames: 1,
            frameX: 0,
            spriteFrames: null,

            // Hit Tracking for Continuous Damage
            hitTimers: new Map(), // Map<EnemyID, TimeSinceLastHit>
            tickInterval: params.tickInterval || 0.1,

            // Hide fallback rect while loading image to avoid "Red Square" glitch for this specific skill
            hideWhileLoading: true,

            update: function (dt) {
                // Rotation
                this.rotation += (params.rotationSpeed || -15) * dt;

                if (this.state === 0) {
                    // --- Outward Phase ---
                    // Decelerate
                    this.currentSpeed += this.acceleration * dt;

                    // Update Velocity
                    this.vx = this.directionX * this.currentSpeed;
                    this.vy = this.directionY * this.currentSpeed;

                    // Move
                    const dx = this.vx * dt;
                    const dy = this.vy * dt;
                    this.x += dx;
                    this.y += dy;

                    // Switch to Return if stopped or slow enough
                    if (this.currentSpeed <= 0) {
                        this.state = 1;
                        this.currentSpeed = 0;
                    }

                    // Check Distance safety
                    this.distTraveled += Math.sqrt(dx * dx + dy * dy);
                    if (this.distTraveled >= this.maxDist) {
                        this.state = 1; // Force return
                    }

                    // Check Wall Collision (Reduced Hitbox to prevent snagging on spawn)
                    // Use a tiny 4x4 central box for wall checks (Visual is HUGE)
                    const wallCheckSize = 4;
                    const wallCheckMargin = (Math.min(this.w, this.h) - wallCheckSize) / 2;
                    // Ensure margin is positive
                    const m = wallCheckMargin > 0 ? wallCheckMargin : 0;

                    const wx = this.x + m;
                    const wy = this.y + m;
                    const ww = this.w - m * 2;
                    const wh = this.h - m * 2;

                    if (game.map.isWall(wx, wy) ||
                        game.map.isWall(wx + ww, wy) ||
                        game.map.isWall(wx, wy + wh) ||
                        game.map.isWall(wx + ww, wy + wh)) {
                        // Undo move (Clamp to previous)
                        this.x -= dx;
                        this.y -= dy;

                        // Force state change and zero speed (Immediate Return)
                        this.state = 1;
                        this.currentSpeed = 0;
                    }

                } else {
                    // --- Return Phase ---
                    // Accelerate towards owner
                    const targetX = this.owner.x + this.owner.width / 2 - this.w / 2;
                    const targetY = this.owner.y + this.owner.height / 2 - this.h / 2;

                    const dx = targetX - this.x;
                    const dy = targetY - this.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    // Catch Check
                    if (dist < 30) {
                        this.life = -1; // Caught
                        return;
                    }

                    // Homing Logic
                    const dirX = dx / dist;
                    const dirY = dy / dist;

                    // Accelerate speed
                    this.currentSpeed += (returnSpeedMax * 1.5) * dt; // Accelerate fast
                    if (this.currentSpeed > returnSpeedMax) this.currentSpeed = returnSpeedMax;

                    this.vx = dirX * this.currentSpeed;
                    this.vy = dirY * this.currentSpeed;

                    this.x += this.vx * dt;
                    this.y += this.vy * dt;
                }

                // Update Hit Timers
                for (let [enemyId, timer] of this.hitTimers) {
                    this.hitTimers.set(enemyId, timer + dt);
                }

                // Trail Effect (Ghost)
                if (Math.random() < 0.6) {
                    game.animations.push({
                        type: 'ghost',
                        x: this.x, y: this.y,
                        w: this.w, h: this.h,
                        life: 0.15, maxLife: 0.15,
                        color: params.trailColor || 'rgba(255, 0, 0, 0.5)',
                        image: this.image,
                        frames: this.frames,
                        frameX: this.frameX,
                        rotation: this.rotation,
                        vx: 0, vy: 0
                    });
                }

                // Scattered Red Particles (Round)
                // Spawn rate: e.g., 2 per frame on average
                for (let i = 0; i < 2; i++) {
                    const angle = Math.random() * Math.PI * 2;
                    const scatterDist = Math.random() * 30; // Scatter radius
                    const px = this.x + this.w / 2 + Math.cos(angle) * scatterDist;
                    const py = this.y + this.h / 2 + Math.sin(angle) * scatterDist;

                    game.animations.push({
                        type: 'particle',
                        shape: 'circle',
                        x: px, y: py,
                        w: 6, h: 6, // Size
                        color: `rgba(255, ${Math.floor(Math.random() * 100)}, ${Math.floor(Math.random() * 100)}, 0.8)`, // Red with slight variety
                        life: 0.4 + Math.random() * 0.2, // Short life
                        maxLife: 0.6,
                        vx: (Math.random() - 0.5) * 60, // Random velocity
                        vy: (Math.random() - 0.5) * 60
                    });
                }
            },

            // Custom Hit Handler
            onHitEnemy: function (enemy, gameInstance) {
                // Ensure enemy has an ID for tracking
                if (!enemy.id) enemy.id = Math.random().toString(36).substr(2, 9);

                let timeSinceLast = this.hitTimers.get(enemy.id);

                // If never hit or interval passed
                if (timeSinceLast === undefined || timeSinceLast >= this.tickInterval) {
                    // Deal Damage (with crit)
                    const isCrit = this.critChance > 0 && Math.random() < this.critChance;
                    const finalDamage = isCrit ? this.damage * (this.critMultiplier || 2.0) : this.damage;
                    enemy.takeDamage(finalDamage, null, this.aetherCharge, isCrit);
                    gameInstance.spawnParticles(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, isCrit ? 8 : 5, isCrit ? '#FFD700' : 'red');

                    // Apply Status
                    if (this.statusEffect && (!this.statusChance || Math.random() < this.statusChance)) {
                        if (enemy.statusManager) {
                            enemy.statusManager.applyStatus(this.statusEffect, 5.0);
                        }
                    }

                    // Reset Timer
                    this.hitTimers.set(enemy.id, 0);
                }
            },

            pierce: params.pierce || 999
        };

        game.projectiles.push(proj);
    },

    'tornado': (user, game, params) => {
        let vx = 0, vy = 0;
        const speed = params.speed || 100;

        if (user.facing === 'left') { vx = -speed; }
        else if (user.facing === 'right') { vx = speed; }
        else if (user.facing === 'up') { vy = -speed; }
        else if (user.facing === 'down') { vy = speed; }
        else if (user.facing === 'up-left') { vx = -speed * 0.707; vy = -speed * 0.707; }
        else if (user.facing === 'up-right') { vx = speed * 0.707; vy = -speed * 0.707; }
        else if (user.facing === 'down-left') { vx = -speed * 0.707; vy = speed * 0.707; }
        else if (user.facing === 'down-right') { vx = speed * 0.707; vy = speed * 0.707; }

        // Spawn offset
        let spawnX = user.x + user.width / 2;
        let spawnY = user.y + user.height / 2;
        if (user.facing === 'left') spawnX -= 30;
        else if (user.facing === 'right') spawnX += 30;
        else if (user.facing === 'up') spawnY -= 30;
        else if (user.facing === 'down') spawnY += 30;
        else if (user.facing === 'up-left') { spawnX -= 21; spawnY -= 21; }
        else if (user.facing === 'up-right') { spawnX += 21; spawnY -= 21; }
        else if (user.facing === 'down-left') { spawnX -= 21; spawnY += 21; }
        else if (user.facing === 'down-right') { spawnX += 21; spawnY += 21; }

        // Ensure 1:1 Aspect Ratio (Square)
        const size = Math.max(params.width || 90, params.height || 90);

        const proj = spawnProjectile(game, spawnX, spawnY, vx, vy, {
            ...params,
            width: size,
            height: size,
            life: params.life || 5.0,
            shape: 'tornado',
            noShake: true,
            spriteSheet: 'assets/tornado.png',
            noTrail: true, // Ensure no orange trails
            damageColor: params.damageColor, // Pass damageColor
            aetherCharge: params.aetherCharge, // Pass charge
            pierce: 999 // Ensure it passes through all enemies
        });

        if (proj) {
            proj.hitTimers = new Map();

            proj.onHitEnemy = function (enemy, gameObj, dt) {
                const now = performance.now();
                const lastHit = this.hitTimers.get(enemy.id) || 0;
                const interval = (params.tickInterval || 0.2) * 1000;

                // Fallback dt if not passed (though main.js now passes it)
                const deltaTime = dt || 0.016;

                // Physics (Suction + Drag) - Apply every frame for smooth "engulfing"
                const centerX = this.x + this.w / 2;
                const centerY = this.y + this.h / 2;
                const enemyCX = enemy.x + enemy.width / 2;
                const enemyCY = enemy.y + enemy.height / 2;

                const dx = centerX - enemyCX;
                const dy = centerY - enemyCY;
                const dist = Math.sqrt(dx * dx + dy * dy);

                // Helper to check if a rect overlaps a wall
                const checkWallOverlap = (x, y, w, h) => {
                    return gameObj.map.isWall(x, y) ||
                        gameObj.map.isWall(x + w, y) ||
                        gameObj.map.isWall(x, y + h) ||
                        gameObj.map.isWall(x + w, y + h);
                };

                // Suction (Pull towards center)
                // dist > 5 to avoid jitter
                if (dist > 5) {
                    const pullStrength = 400.0; // Px/sec (Increased from ~180)
                    const pullX = (dx / dist) * pullStrength * deltaTime;
                    const pullY = (dy / dist) * pullStrength * deltaTime;

                    // Try X
                    if (!checkWallOverlap(enemy.x + pullX, enemy.y, enemy.width, enemy.height)) {
                        enemy.x += pullX;
                    }
                    // Try Y
                    if (!checkWallOverlap(enemy.x, enemy.y + pullY, enemy.width, enemy.height)) {
                        enemy.y += pullY;
                    }
                }

                // Drag (Move with Tornado)
                // Match tornado speed exactly to keep them inside
                const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
                const dragStrength = speed;
                if (speed > 1) {
                    const dragX = (this.vx / speed) * dragStrength * deltaTime;
                    const dragY = (this.vy / speed) * dragStrength * deltaTime;

                    // Try X
                    if (!checkWallOverlap(enemy.x + dragX, enemy.y, enemy.width, enemy.height)) {
                        enemy.x += dragX;
                    }
                    // Try Y
                    if (!checkWallOverlap(enemy.x, enemy.y + dragY, enemy.width, enemy.height)) {
                        enemy.y += dragY;
                    }
                }

                // Periodic Damage
                if (now - lastHit > interval) {
                    this.hitTimers.set(enemy.id, now);
                    const isCrit = this.critChance > 0 && Math.random() < this.critChance;
                    const finalDamage = isCrit ? this.damage * (this.critMultiplier || 2.0) : this.damage;
                    enemy.takeDamage(finalDamage, this.damageColor, this.aetherCharge, isCrit);

                    // Optional: White wind hit particle
                    if (Math.random() < 0.5) {
                        gameObj.animations.push({
                            type: 'particle',
                            x: enemyCX,
                            y: enemyCY,
                            w: 4, h: 4,
                            life: 0.3, maxLife: 0.3,
                            color: '#ffffff',
                            vx: (Math.random() - 0.5) * 100,
                            vy: (Math.random() - 0.5) * 100
                        });
                    }
                }


            };

            // Particle Trail System
            proj.trailParticles = [];

            // Override update to manage particles and custom fade
            proj.ignoreWallDestruction = true;

            proj.update = function (dt) {
                if (this.hitPool) this.hitPool.clear(); // Allow re-collision for suction/drag every frame

                if (this.opacity === undefined) this.opacity = 1.0;

                this.x += this.vx * dt;
                this.y += this.vy * dt;

                // Wall Check: Fade out while moving
                if (game.map.isWall(this.x + this.w / 2, this.y + this.h / 2)) {
                    this.isFading = true;
                    this.damage = 0; // Stop dealing damage
                }

                if (this.isFading) {
                    this.opacity -= dt * 5.0; // Fade out quickly (approx 0.2s)
                    if (this.opacity <= 0) {
                        this.opacity = 0;
                        this.life = 0; // Destroy when fully transparent
                    }
                } else {
                    this.life -= dt;
                }

                // Update particles
                for (let i = this.trailParticles.length - 1; i >= 0; i--) {
                    const p = this.trailParticles[i];
                    p.x += p.vx * dt;
                    p.y += p.vy * dt;
                    p.life -= dt;
                    if (p.life <= 0) {
                        this.trailParticles.splice(i, 1);
                    }
                }

                // Spawn new particles (Multiple small rectangles)
                const count = 3; // Reduced by 50% (6 -> 3)
                if (Math.abs(this.vx) > 10 || Math.abs(this.vy) > 10) {
                    const angle = Math.atan2(this.vy, this.vx);
                    for (let i = 0; i < count; i++) {
                        // Spread emission position wide (User wanted width, but narrow movement)
                        const spread = (Math.random() - 0.5) * 80; // Wide spawn area (Tornado width ~90)

                        // Perpendicular offset for spawn
                        const px = this.x + this.w / 2 + Math.cos(angle + Math.PI / 2) * spread - Math.cos(angle) * (this.w * 0.4); // Move backwards
                        const py = this.y + this.h / 2 + Math.sin(angle + Math.PI / 2) * spread - Math.sin(angle) * (this.h * 0.4); // Move backwards

                        // Calculate velocity: Mostly opposite to movement, with very little random spread
                        // Add small randomness to speed (magnitude), but keep direction tight
                        const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy) * 0.2 + Math.random() * 20;

                        // Randomize angle slightly (narrow movement spread)
                        const moveAngle = angle + Math.PI + (Math.random() - 0.5) * 0.2; // roughly +/- 6 degrees

                        this.trailParticles.push({
                            x: px,
                            y: py,
                            vx: Math.cos(moveAngle) * speed,
                            vy: Math.sin(moveAngle) * speed,
                            life: 0.3 + Math.random() * 0.3,
                            maxLife: 0.6,
                            w: 20 + Math.random() * 20, // Longer (was 15+15)
                            h: 1,                       // Thinner (was 1+2)
                            angle: angle // Align visual rotation with tornado flow
                        });
                    }
                }
            };

            // Custom Draw
            proj.draw = function (ctx) {
                // Draw Particles
                if (this.trailParticles.length > 0) {
                    ctx.save();
                    for (const p of this.trailParticles) {
                        ctx.save();
                        ctx.translate(p.x, p.y);
                        ctx.rotate(p.angle);

                        // Fade out
                        const alpha = Math.max(0, p.life / p.maxLife * 0.8);
                        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;

                        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
                        ctx.restore();
                    }
                    ctx.restore();
                }

                if (!this.image || !this.image.complete) return;

                const centerW = Math.floor(this.x + this.w / 2);
                const centerH = Math.floor(this.y + this.h / 2);

                ctx.save();
                ctx.translate(centerW, centerH);

                // Rotation (Spin)
                const time = performance.now() / 150;
                ctx.rotate(time * 2);

                // Opacity
                ctx.globalAlpha = (this.opacity !== undefined) ? this.opacity : 1.0;

                // Pulse Scale
                const scale = 1.0 + Math.sin(time * 3) * 0.1;
                ctx.scale(scale, scale);

                const size = Math.max(this.w, this.h) * 1.8;
                ctx.drawImage(this.image, -size / 2, -size / 2, size, size);

                ctx.restore();
            };
        }
    },

    'chain_lightning': (user, game, params) => {
        const speed = params.speed || 600;

        // Force velocity calculation based on facing (Ignore params.vx/vy to prevent pollution)
        let vx = 0;
        let vy = 0;

        // console.log('Chain Lightning Initial Cast:', user.facing);

        if (user.facing === 'left') vx = -speed;
        else if (user.facing === 'up') vy = -speed;
        else if (user.facing === 'down') vy = speed;
        else if (user.facing === 'up-left') { vx = -speed * 0.707; vy = -speed * 0.707; }
        else if (user.facing === 'up-right') { vx = speed * 0.707; vy = -speed * 0.707; }
        else if (user.facing === 'down-left') { vx = -speed * 0.707; vy = speed * 0.707; }
        else if (user.facing === 'down-right') { vx = speed * 0.707; vy = speed * 0.707; }
        else vx = speed; // Default to right

        // Spawn origin
        const spawnX = user.x + user.width / 2;
        const spawnY = user.y + user.height / 2;

        const proj = spawnProjectile(game, spawnX, spawnY, vx, vy, {
            ...params,
            shape: 'triangle',
            width: params.width || 40,
            height: params.height || 8,
            fixedOrientation: true, // Prevent auto-swap if any
        });

        // Critical Fix: Explicitly set rotation because spawnProjectile ignores params.rotation
        if (proj) {
            proj.rotation = Math.atan2(vy, vx);

            // Explicitly attach chain state params
            proj.chainCount = (params.chainCount !== undefined) ? params.chainCount : 3;
            proj.chainRange = params.chainRange || 300;
            proj.ignoreId = params.ignoreId || null; // Ignore specific ID (previous source)
            proj.isChain = params.isChain || false; // Flag for visuals

            // Custom Draw to handle rotation correctly for Triangle shape
            // (Standard fallback drawing in main.js does not rotate non-image shapes)
            proj.draw = function (ctx) {
                ctx.save();
                ctx.translate(this.x + this.w / 2, this.y + this.h / 2);
                ctx.rotate(this.rotation);

                // Draw rigid body (Triangle) behavior
                // For chains, we make it transparent (rgba(0,0,0,0)) so it has "shape" but is invisible
                // For the first bolt, we use the actual color.
                ctx.fillStyle = this.isChain ? 'rgba(0,0,0,0)' : this.color;

                // Draw Triangle centered at (0,0) facing Right
                ctx.beginPath();
                // Tip
                ctx.moveTo(this.w / 2, 0);
                // Rear Top
                ctx.lineTo(-this.w / 2, -this.h / 2);
                // Rear Bottom
                ctx.lineTo(-this.w / 2, this.h / 2);
                ctx.closePath();
                ctx.fill();

                // Add Jitter/Crackle visual (white core)
                // For chains, we want MORE crackle to represent pure energy
                const crackleChance = this.isChain ? 2.0 : 0.5; // Always crackle for chains (loop if > 1)
                const loops = Math.ceil(crackleChance);

                ctx.fillStyle = '#fff';
                for (let i = 0; i < loops; i++) {
                    if (Math.random() < (crackleChance / loops) || crackleChance >= 1) {
                        ctx.beginPath();
                        // Random position along length/width for more chaotic look
                        const rx = (Math.random() - 0.5) * this.w;
                        const ry = (Math.random() - 0.5) * this.h * (this.isChain ? 2 : 1); // Wider spread for chain
                        ctx.arc(rx, ry, 2, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }

                ctx.restore();
            };

            proj.onHitEnemy = function (enemy, gameObj) {
                // Prevent hitting the immediate source of this bolt (to avoid self-clipping)
                if (this.ignoreId && enemy.id === this.ignoreId) {
                    return;
                }

                // Initialize hit counts if needed
                if (!this.hitCounts) this.hitCounts = {};

                // Increment hit count for this enemy
                this.hitCounts[enemy.id] = (this.hitCounts[enemy.id] || 0) + 1;

                // 1. Damage (with crit)
                const isCrit_cl = this.critChance > 0 && Math.random() < this.critChance;
                const finalDamage_cl = isCrit_cl ? this.damage * (this.critMultiplier || 2.0) : this.damage;
                enemy.takeDamage(finalDamage_cl, this.damageColor, this.aetherCharge, isCrit_cl);

                // 2. Visual Burst
                // 2. Visual Burst
                spawnLightningBurst(gameObj, enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, {
                    burstCount: 5, burstSize: 60, burstSpeed: 150
                });

                // 3. Chain Logic
                // Check Chain Limit
                if (this.chainCount <= 0) return;

                // Continue as long as we find a valid target
                let bestTarget = null;
                let minHitCount = Infinity; // Priority 1: Lowest Hits
                let minDist = Infinity;     // Priority 2: Distance

                // Find best enemy EXCLUDING:
                // - Current target (self)
                // - Previous source (ignoreId) - explicit check
                // - Enemies who have reached max hits (3)
                gameObj.enemies.forEach(e => {
                    if (e.markedForDeletion || e.id === enemy.id) return;

                    // Allow bouncing back to previous source (A -> B -> A)
                    // The "lowest hit count" priority will naturally handle distribution.

                    // Check max hits
                    const currentHits = this.hitCounts[e.id] || 0;
                    if (currentHits >= 3) return;

                    const dist = Math.hypot(e.x - enemy.x, e.y - enemy.y);
                    if (dist > this.chainRange) return;

                    // Selection Logic: Minimize Hit Count, then Minimize Distance
                    if (currentHits < minHitCount) {
                        minHitCount = currentHits;
                        minDist = dist;
                        bestTarget = e;
                    } else if (currentHits === minHitCount) {
                        if (dist < minDist) {
                            minDist = dist;
                            bestTarget = e;
                        }
                    }
                });

                if (bestTarget) {
                    // Calculate velocity to next target
                    const angle = Math.atan2(bestTarget.y - enemy.y, bestTarget.x - enemy.x);
                    // Maintain speed
                    const moveSpeed = Math.hypot(this.vx, this.vy);
                    const nvx = Math.cos(angle) * moveSpeed;
                    const nvy = Math.sin(angle) * moveSpeed;

                    // Chain!
                    const nextProj = spawnProjectile(gameObj, enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, nvx, nvy, {
                        ...params,
                        vx: nvx, vy: nvy,
                        life: 0.5, // Fresh life for the hop
                    });

                    if (nextProj) {
                        // Pass State
                        nextProj.rotation = angle; // Explicit set rotation
                        nextProj.chainRange = this.chainRange;
                        nextProj.ignoreId = enemy.id; // Correctly pass ignoreId to instance
                        nextProj.isChain = true;      // Correctly pass isChain to instance
                        nextProj.hitCounts = { ...this.hitCounts }; // Clone hit counts state
                        nextProj.aetherCharge = this.aetherCharge; // Pass charge to chain
                        nextProj.chainCount = this.chainCount - 1; // Decrement chain count

                        // Recursively assign this same handler
                        nextProj.draw = this.draw;
                        nextProj.onHitEnemy = this.onHitEnemy;
                    }
                }

                // Destroy self
                this.life = 0;
            };
        }
    },
    'magma_spear': (user, game, params) => {
        let vx = 0, vy = 0;
        let speed = params.speed || 400;
        let rotation = 0;

        // Directional logic
        if (user.facing === 'left') { vx = -speed; rotation = Math.PI; }
        else if (user.facing === 'right') { vx = speed; rotation = 0; }
        else if (user.facing === 'up') { vy = -speed; rotation = -Math.PI / 2; }
        else if (user.facing === 'down') { vy = speed; rotation = Math.PI / 2; }
        else if (user.facing === 'up-left') { vx = -speed * 0.707; vy = -speed * 0.707; rotation = -3 * Math.PI / 4; }
        else if (user.facing === 'up-right') { vx = speed * 0.707; vy = -speed * 0.707; rotation = -Math.PI / 4; }
        else if (user.facing === 'down-left') { vx = -speed * 0.707; vy = speed * 0.707; rotation = 3 * Math.PI / 4; }
        else if (user.facing === 'down-right') { vx = speed * 0.707; vy = speed * 0.707; rotation = Math.PI / 4; }

        const spawnX = user.x + user.width / 2;
        const spawnY = user.y + user.height / 2;

        const proj = spawnProjectile(game, spawnX, spawnY, vx, vy, {
            ...params,
            rotation: rotation,
            fixedOrientation: true,
            pierce: 0 // No pierce: explodes on first hit
        });

        if (proj) {
            // Helper to trigger the "Reworked Impact" (Explosion + Eruptions)
            const triggerImpact = (gameObj, x, y) => {
                // 1. Central Large Explosion
                spawnExplosion(gameObj, x, y, params.color || '#ff4400', 0.5, 0.15);
                gameObj.camera.shake(0.2, 8);

                // 2. Spawn multiple Eruptions (Magma Puddles + Fire Particles)
                const eruptionCount = 16;
                const spread = 120;

                for (let i = 0; i < eruptionCount; i++) {
                    let ox = 0, oy = 0;
                    let dist = 0;
                    if (i > 0) {
                        // Circular distribution with quadratic falloff for center density
                        const angle = Math.random() * Math.PI * 2;
                        dist = Math.pow(Math.random(), 2) * spread; // Squared random for center bias
                        ox = Math.cos(angle) * dist;
                        oy = Math.sin(angle) * dist;
                    }
                    const ex = x + ox;
                    const ey = y + oy;

                    // Delay based on distance for "spreading outward" feel
                    const startDelay = (dist / spread) * 0.25;

                    const pLife = params.puddleLife;
                    gameObj.animations.push({
                        type: 'magma_puddle',
                        layer: 'bottom',
                        x: ex,
                        y: ey,
                        radius: 20,
                        life: pLife,
                        maxLife: pLife,
                        delay: startDelay,
                        damage: params.puddleDamage || 5,
                        slow: 0.5,
                        hitEnemies: new Map(),
                        randSeed: Math.random() * 100,
                        randHeight: 0.8 + Math.random() * 0.4,
                        randSpeed: 0.9 + Math.random() * 0.2,
                        update: function (dt2) {
                            if (this.delay > 0) {
                                this.delay -= dt2;
                                return;
                            }
                            this.life -= dt2;
                            if (Math.random() < 0.5) {
                                const isSmoke = Math.random() < 0.3;
                                gameObj.spawnParticles(
                                    this.x + (Math.random() - 0.5) * this.radius * 0.4,
                                    this.y,
                                    1,
                                    isSmoke ? '#333333' : (Math.random() < 0.5 ? '#ff4400' : '#ffbb00'),
                                    (Math.random() - 0.5) * 12,
                                    -60 - Math.random() * 60,
                                    { shape: 'circle', shrink: true, size: 6 + Math.random() * 4 }
                                );
                            }
                            gameObj.enemies.forEach(e2 => {
                                const ex2 = (e2.x + e2.width / 2) - this.x;
                                const ey2 = (e2.y + e2.height / 2) - this.y;
                                if (Math.hypot(ex2, ey2) < this.radius) {
                                    e2.tempSlow = 0.2;
                                    e2.slowMultiplier = this.slow;
                                    let tickTimer = this.hitEnemies.get(e2) || 0;
                                    tickTimer -= dt2;
                                    if (tickTimer <= 0) {
                                        const isCrit = false;
                                        const finalDmg = this.damage;
                                        e2.takeDamage(finalDmg, '#ff4400', params.puddleAetherCharge || 0.1, isCrit);
                                        this.hitEnemies.set(e2, 0.4); // Faster ticks
                                        gameObj.spawnParticles(e2.x + e2.width / 2, e2.y + e2.height / 2, 2, '#ff4400');
                                    } else {
                                        this.hitEnemies.set(e2, tickTimer);
                                    }
                                }
                            });
                        },
                        draw: function (ctx) {
                            if (this.delay > 0) return;
                            ctx.save();
                            const alpha = Math.min(1, this.life / 0.5);
                            ctx.globalAlpha = alpha * 0.8;
                            const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.radius);
                            grad.addColorStop(0, '#ff4400');
                            grad.addColorStop(1, 'rgba(255, 68, 0, 0)');
                            ctx.fillStyle = grad;
                            ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); ctx.fill();
                            const surfaceGrad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.radius);
                            surfaceGrad.addColorStop(0, 'rgba(255, 68, 0, 0.8)');
                            surfaceGrad.addColorStop(0.6, 'rgba(255, 68, 0, 0.3)');
                            surfaceGrad.addColorStop(1, 'rgba(255, 68, 0, 0)');
                            ctx.fillStyle = surfaceGrad;
                            ctx.beginPath(); ctx.ellipse(this.x, this.y, this.radius, this.radius * 0.4, 0, 0, Math.PI * 2); ctx.fill();
                            const t = (this.maxLife - this.life) * 10 * this.randSpeed + this.randSeed;
                            const emberCount = 14;
                            for (let i = 0; i < emberCount; i++) {
                                const offset = (i / emberCount) * Math.PI * 2;
                                const progress = (t * 0.15 + offset) % 1.0;
                                const spreadX = Math.sin(this.randSeed + i * 2) * (this.radius * 0.25);
                                const exP = this.x + spreadX * progress;
                                const eyP = this.y - (this.radius * 1.2 * progress * this.randHeight);
                                const eSize = (6 + Math.random() * 4) * (1 - progress * 0.7);
                                let color;
                                if (progress < 0.4) color = i % 3 === 0 ? '#ffffff' : (i % 3 === 1 ? '#ffff00' : '#ff4400');
                                else if (progress < 0.7) color = '#662200';
                                else color = '#111111';
                                ctx.globalAlpha = alpha * (1 - progress);
                                ctx.fillStyle = color;
                                ctx.beginPath(); ctx.arc(exP, eyP, eSize, 0, Math.PI * 2); ctx.fill();
                            }
                            const coreGrad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.radius * 0.5);
                            coreGrad.addColorStop(0, '#ffff00'); coreGrad.addColorStop(1, 'rgba(255, 187, 0, 0)');
                            ctx.fillStyle = coreGrad;
                            ctx.beginPath(); ctx.ellipse(this.x, this.y, this.radius * 0.4, this.radius * 0.2, 0, 0, Math.PI * 2); ctx.fill();
                            ctx.restore();
                        }
                    });
                }
            };

            proj.onHitWall = function (gameInstance) {
                const cx = this.x + this.w / 2;
                const cy = this.y + this.h / 2;
                const halfLen = 64; // Spear length is 128
                const tipX = cx + Math.cos(this.rotation) * halfLen;
                const tipY = cy + Math.sin(this.rotation) * halfLen;

                triggerImpact(gameInstance, tipX, tipY);
                this.life = 0; // Destroy on wall hit
            };

            proj.onHitEnemy = function (enemy, gameInstance) {
                // 1. Initial Spear Damage
                const isCrit = params.critChance > 0 && Math.random() < params.critChance;
                const finalDamage = isCrit ? params.damage * (params.critMultiplier || 2.0) : params.damage;
                enemy.takeDamage(finalDamage, params.damageColor, params.aetherCharge || 0, isCrit);

                if (params.statusEffect && Math.random() < (params.statusChance || 0)) {
                    if (enemy.statusManager) {
                        enemy.statusManager.applyStatus(params.statusEffect, 5.0);
                    }
                }

                // 2. Trigger Burst at Tip
                const cx = this.x + this.w / 2;
                const cy = this.y + this.h / 2;
                const halfLen = 64;
                const tipX = cx + Math.cos(this.rotation) * halfLen;
                const tipY = cy + Math.sin(this.rotation) * halfLen;

                triggerImpact(gameInstance, tipX, tipY);

                this.life = 0; // Destroy on first enemy hit
            };
        }
    },
};
