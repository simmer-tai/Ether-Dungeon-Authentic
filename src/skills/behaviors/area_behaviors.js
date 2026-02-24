import { spawnExplosion, spawnIceShatter, spawnProjectile, spawnAetherExplosion, spawnLightningBolt, spawnLightningBurst, spawnThunderBurstImpact, spawnThunderfallImpact } from '../common.js';
import { getCachedImage } from '../../utils.js';

export const areaBehaviors = {
    'area_blast': (user, game, params) => {
        const center = { x: user.x + user.width / 2, y: user.y + user.height / 2 };

        // Immobilize User
        if (params.duration > 0) {
            user.isCasting = true;
            game.animations.push({
                type: 'logic',
                life: params.duration,
                maxLife: params.duration,
                update: function (dt) {
                    this.life -= dt;
                    if (this.life <= 0) {
                        user.isCasting = false;
                    }
                }
            });
        }

        // Visual Sprite Animation
        if (params.spriteSheet && (!params.interval || params.interval <= 0)) {
            // Spawn a visual-only projectile (no damage, no physics)
            const visualParams = { ...params, visual: true, speed: 0, life: params.duration, damageColor: params.damageColor };
            spawnProjectile(game, center.x, center.y, 0, 0, visualParams);
        } else if (!params.spriteSheet) {
            // Ring (Fallback if no sprite)
            game.animations.push({
                type: 'ring',
                x: center.x, y: center.y,
                radius: 10, maxRadius: params.range,
                width: 8,
                life: params.duration, maxLife: params.duration,
                color: params.color
            });

            // Particles (Fallback if no sprite)
            const count = params.particleCount || 16;
            for (let i = 0; i < count; i++) {
                const angle = (i / count) * Math.PI * 2;
                game.animations.push({
                    type: 'particle',
                    x: center.x, y: center.y,
                    w: 6, h: 6,
                    life: 0.5, maxLife: 0.5,
                    color: params.particleColor || '#88ffff',
                    vx: Math.cos(angle) * 350,
                    vy: Math.sin(angle) * 350
                });
            }
        }

        // Damage Logic
        if (params.interval && params.interval > 0) {
            // Damage over Time (DoT) Field
            let damageTimer = params.interval;

            game.animations.push({
                type: 'field', // Invisible logic object
                life: params.duration,
                update: (dt) => {
                    damageTimer += dt;
                    if (damageTimer >= params.interval) {
                        damageTimer = 0;

                        // Spawn Visual Per Tick
                        // Spawn Visual Per Tick
                        if (params.spriteSheet) {
                            const tickLife = 0.25;
                            const tickParams = {
                                ...params,
                                visual: true,
                                speed: 0,
                                noTrail: true, // Fix: Prevent orange trail particles
                                life: tickLife,
                            };
                            spawnProjectile(game, center.x, center.y, 0, 0, tickParams);
                        }

                        // Additional Lightning Burst
                        spawnThunderBurstImpact(game, center.x, center.y, {
                            burstCount: 3,
                            burstSize: params.range * 0.8, // Reduced from 1.8 to contain in image
                            burstSpeed: 50
                        });

                        // Deal Damage
                        game.enemies.forEach(enemy => {
                            const ex = enemy.x + enemy.width / 2;
                            const ey = enemy.y + enemy.height / 2;
                            const dist = Math.sqrt((ex - center.x) ** 2 + (ey - center.y) ** 2);
                            if (dist < params.range) {
                                enemy.takeDamage(params.damage, params.damageColor, params.aetherCharge);
                                // Shake on hit
                                game.camera.shake(0.15, 3.5);

                                spawnThunderBurstImpact(game, ex, ey, {
                                    burstCount: 1,
                                    burstSize: 30,
                                    burstSpeed: 50
                                });
                            }
                        });
                    }
                }
            });
        } else {
            // Instant Damage
            game.enemies.forEach(enemy => {
                const ex = enemy.x + enemy.width / 2;
                const ey = enemy.y + enemy.height / 2;
                const dist = Math.sqrt((ex - center.x) ** 2 + (ey - center.y) ** 2);
                if (dist < params.range) {
                    enemy.takeDamage(params.damage, params.damageColor, params.aetherCharge);
                    game.spawnParticles(ex, ey, 10, '#ff0000');
                }
            });
        }
    },

    'ice_spike': function (user, game, params) {
        // Base spawn center
        const startX = user.x + user.width / 2;
        const startY = user.y + user.height / 2;

        // Direction based on Player Facing
        let dx = 0;
        let dy = 0;
        // user.facing is 'left', 'right', 'up', 'down'
        // user.facing is 'left', 'right', 'up', 'down', or diagonal
        if (user.facing === 'left') dx = -1;
        else if (user.facing === 'right') dx = 1;
        else if (user.facing === 'up') dy = -1;
        else if (user.facing === 'down') dy = 1;
        else if (user.facing === 'up-left') { dx = -0.707; dy = -0.707; }
        else if (user.facing === 'up-right') { dx = 0.707; dy = -0.707; }
        else if (user.facing === 'down-left') { dx = -0.707; dy = 0.707; }
        else if (user.facing === 'down-right') { dx = 0.707; dy = 0.707; }

        // Fallback if no facing (shouldn't happen)
        if (dx === 0 && dy === 0) dy = 1;

        const count = params.count || 30;
        const spacing = params.spacing || 5;
        const duration = params.duration || 1.0; // Life of each spike
        const width = params.width || 10;
        const maxH = params.height || 46;

        // Lock movement during activation
        user.isCasting = true;

        const image = params.spriteSheet ? getCachedImage(params.spriteSheet) : null;

        // Spawner state
        let spawnedCount = 0;
        let timer = 0;
        const spawnInterval = 0.02; // Speed of wave

        game.animations.push({
            type: 'spawner',
            life: count * spawnInterval + 1.0, // Ensure it lives long enough
            update: function (dt) {
                // Check if finished
                if (spawnedCount >= count) {
                    user.isCasting = false;
                    this.life = 0;
                    return;
                }

                timer += dt;
                while (timer >= spawnInterval && spawnedCount < count) {
                    timer -= spawnInterval;
                    spawnedCount++;
                    const i = spawnedCount;

                    // Calc Base Position along line
                    let targetX = startX + (dx * spacing * i);
                    let targetY = startY + (dy * spacing * i);

                    // Apply Perpendicular Offset
                    const offsetP = (Math.random() * 10) - 5;
                    if (dx !== 0) {
                        targetY += offsetP;
                    } else if (dy !== 0) {
                        targetX += offsetP;
                    }

                    const baseY = targetY + maxH / 2;

                    // Random Variation
                    const scale = 0.7 + Math.random() * 0.6; // 0.7 to 1.3
                    const angleDeg = (Math.random() * 30) - 15; // -15 to +15 degrees
                    const angleRad = angleDeg * (Math.PI / 180);

                    const finalW = width * scale;
                    const finalMaxH = maxH * scale;

                    const proj = {
                        id: i,
                        active: true,
                        type: 'projectile',
                        x: targetX - finalW / 2,
                        y: baseY, // Start at bottom
                        w: finalW,
                        h: 0, // Start Height 0

                        vx: 0, vy: 0,

                        // Rotation & Anchor
                        spinning: true,
                        rotation: angleRad,
                        anchorX: 0.5,
                        anchorY: 1.0,

                        life: duration,
                        maxLife: duration,

                        // Sprite Properties
                        frameX: 0,
                        frames: params.frames || 1,

                        // Custom
                        maxH: finalMaxH,
                        baseY: baseY,
                        damage: params.damage,
                        tickInterval: params.tickInterval || 0.5,
                        hitTimers: new Map(),

                        image: image,
                        color: '#a5f2f3',
                        damageColor: params.damageColor,
                        aetherCharge: params.aetherCharge,
                        alpha: 1.0,

                        hideWhileLoading: false,
                        hasSpawnedEffects: false,

                        update: function (dt) {
                            // Spawn Particles on first frame active
                            if (!this.hasSpawnedEffects) {
                                for (let k = 0; k < 3; k++) {
                                    game.animations.push({
                                        type: 'particle',
                                        x: this.x + this.w / 2,
                                        y: this.baseY,
                                        w: 4, h: 4,
                                        vx: (Math.random() - 0.5) * 100, // Spread X
                                        vy: -(150 + Math.random() * 150), // Shoot Up
                                        life: 0.4,
                                        maxLife: 0.4,
                                        color: '#a5f2f3',
                                        update: function (pDt) {
                                            this.vy += 600 * pDt; // Gravity
                                        }
                                    });
                                }
                                this.hasSpawnedEffects = true;
                            }

                            this.life -= dt;

                            // Growth Animation (0.05s)
                            const timeAlive = this.maxLife - this.life;
                            const growTime = 0.05;

                            if (timeAlive < growTime) {
                                this.h = this.maxH * (timeAlive / growTime);
                            } else {
                                this.h = this.maxH;
                            }

                            this.y = this.baseY - this.h;

                            // Fade out check
                            if (this.life < 0.5) {
                                this.alpha = this.life / 0.5;
                            }

                            // Hit Logic
                            for (let [id, t] of this.hitTimers) {
                                this.hitTimers.set(id, t + dt);
                            }
                        },

                        onHitEnemy: function (enemy, gameInstance) {
                            if (!enemy.id) enemy.id = Math.random().toString(36).substr(2, 9);
                            let t = this.hitTimers.get(enemy.id);

                            if (t === undefined || t >= this.tickInterval) {
                                enemy.takeDamage(this.damage, this.damageColor, this.aetherCharge);
                                gameInstance.spawnParticles(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, 5, 'cyan');
                                this.hitTimers.set(enemy.id, 0);
                            }
                        },
                        pierce: 999
                    };
                    game.projectiles.push(proj);
                }
            }
        });
    },

    'ice_garden': (user, game, params) => {
        // Aether Rush Modifiers
        if (user.isAetherRush) {
            params.radius = (params.radius || 150) * 2;
            params.tickInterval = (params.tickInterval || 0.5) / 2;
            console.log("Aether Rush Ice Garden!");
        }

        const duration = params.duration || 5.0;
        const radius = params.radius || 150;

        // Spawn Area Logic Entity
        game.animations.push({
            type: 'logic', // Invisible logic entity (or custom draw)
            x: user.x + user.width / 2,
            y: user.y + user.height / 2,
            radius: radius,
            life: duration,
            maxLife: duration,
            tickTimer: 0,
            tickInterval: params.tickInterval || 0.5, // Spike spawn interval
            layer: 'bottom', // Render at back
            visuals: [], // Store relative visual spike data

            // Initialize Visuals
            visualsInitialized: false,
            initVisuals: function () {
                if (this.visualsInitialized) return;
                this.visualsInitialized = true;

                // --- Connected Crystal Mesh Generation (High Density & Randomness) ---
                this.mesh = { vertices: [], faces: [] };

                // Helper to push vertex ring
                const addVertexRing = (rMinRatio, rMaxRatio, count, offsetJitter = 0.5) => {
                    const startIdx = this.mesh.vertices.length;
                    for (let i = 0; i < count; i++) {
                        // Base angle + random jitter
                        const baseAngle = (i / count) * Math.PI * 2;
                        const angleJitter = (Math.random() - 0.5) * (Math.PI * 2 / count) * offsetJitter;
                        const angle = baseAngle + angleJitter;

                        // Radius with variance
                        const rBase = radius * ((rMinRatio + rMaxRatio) / 2);
                        const rVar = radius * (rMaxRatio - rMinRatio) * 0.5;
                        const r = rBase + (Math.random() - 0.5) * 2 * rVar;

                        this.mesh.vertices.push({
                            x: Math.cos(angle) * r,
                            y: Math.sin(angle) * r
                        });
                    }
                    return { start: startIdx, count: count };
                };

                // 1. Generate Vertices (Rings)
                this.mesh.vertices.push({ x: 0, y: 0 }); // Index 0: Center

                // High Density: 9 Rings (More concentric layers)
                const rings = [];
                const ringCount = 9;

                // Base density curve:
                // Inner rings need fewer vertices, outer rings need many more.
                // 15 -> 22 -> 29 ...

                for (let i = 0; i < ringCount; i++) {
                    // Radius distribution (0.1 start to 1.0)
                    const progress = i / ringCount;
                    const nextProgress = (i + 1) / ringCount;

                    const minR = 0.1 + progress * 0.9;
                    const maxR = 0.1 + nextProgress * 0.9;

                    // Vertex count: Start around 12, increase significantly
                    const baseCount = 12 + Math.floor(i * 6); // 12, 18, 24, 30 ...
                    const vCount = baseCount + Math.floor(Math.random() * 4);

                    // Jitter: Less jitter on inner rings for smoother center? Or varying.
                    rings.push(addVertexRing(minR, maxR, vCount, 0.7));
                }

                // 2. Generate Faces (Triangulation)
                let tempFaces = []; // Collect all triangles first

                // Helper: Connect Ring A to Ring B using "Zipper" algorithm to fill all gaps
                const connectRings = (ringA, ringB, alphaBase) => {
                    let ia = 0;
                    let ib = 0;
                    const countA = ringA.count;
                    const countB = ringB.count;

                    // Total triangles needed = countA + countB
                    // We loop until we wrap around both rings
                    let steps = countA + countB;

                    while (steps > 0) {
                        const idxA = ringA.start + (ia % countA);
                        const nextIdxA = ringA.start + ((ia + 1) % countA);
                        const idxB = ringB.start + (ib % countB);
                        const nextIdxB = ringB.start + ((ib + 1) % countB);

                        const vA = this.mesh.vertices[idxA];
                        const vnA = this.mesh.vertices[nextIdxA];
                        const vB = this.mesh.vertices[idxB];
                        const vnB = this.mesh.vertices[nextIdxB];

                        // Measure diagonal candidates
                        // Option 1: Triangle (A[i], A[i+1], B[i]) -> Advance A
                        // Diagonal length: dist(A[i+1], B[i])
                        const d1 = Math.hypot(vnA.x - vB.x, vnA.y - vB.y);

                        // Option 2: Triangle (A[i], B[i], B[i+1]) -> Advance B
                        // Diagonal length: dist(A[i], B[i+1])
                        const d2 = Math.hypot(vA.x - vnB.x, vA.y - vnB.y);

                        const colorPalette = ['#F0F8FF', '#D6EAF8', '#AED6F1', '#85C1E9', '#5DADE2'];
                        const col = colorPalette[Math.floor(Math.random() * colorPalette.length)];

                        if (d1 < d2) {
                            // Advance A
                            // Triangle: (A[i], A[i+1], B[i])
                            tempFaces.push({
                                indices: [idxA, nextIdxA, idxB],
                                color: col,
                                alpha: 0.3 + Math.random() * 0.4 // 0.3 - 0.7
                            });
                            ia++;
                        } else {
                            // Advance B
                            // Triangle: (A[i], B[i], B[i+1]) (Note order for CCW/CW consistency? Let's just store)
                            tempFaces.push({
                                indices: [idxA, idxB, nextIdxB],
                                color: col,
                                alpha: 0.3 + Math.random() * 0.4 // 0.3 - 0.7
                            });
                            ib++;
                        }
                        steps--;
                    }
                };

                // Connect Center -> Ring 0
                const r0 = rings[0];
                const colorPalette = ['#F0F8FF', '#D6EAF8', '#AED6F1', '#85C1E9', '#5DADE2'];
                for (let i = 0; i < r0.count; i++) {
                    const next = r0.start + (i + 1) % r0.count;
                    const col = colorPalette[Math.floor(Math.random() * colorPalette.length)];
                    tempFaces.push({
                        indices: [0, r0.start + i, next],
                        color: col,
                        alpha: 0.4 + Math.random() * 0.4
                    });
                }

                // Connect Rings 0->1, 1->2 ...
                for (let i = 0; i < ringCount - 1; i++) {
                    // Decrease alpha slighty as we go out? or keep random.
                    // Connect Ring i -> Ring i+1
                    // reuse connectRings logic
                    connectRings(rings[i], rings[i + 1], 0.25);
                }

                // --- MERGING LOGIC ---
                // Helper check: two faces share an edge if they share 2 vertices
                const canMerge = (f1, f2) => {
                    let shared = 0;
                    f1.indices.forEach(i1 => {
                        if (f2.indices.includes(i1)) shared++;
                    });
                    return shared === 2;
                };

                const mergeFaces = (f1, f2) => {
                    const allIdx = [...new Set([...f1.indices, ...f2.indices])];

                    // Re-sort by angle around centroid to ensure proper polygon shape
                    const cx = allIdx.reduce((s, i) => s + this.mesh.vertices[i].x, 0) / allIdx.length;
                    const cy = allIdx.reduce((s, i) => s + this.mesh.vertices[i].y, 0) / allIdx.length;

                    allIdx.sort((a, b) => {
                        const va = this.mesh.vertices[a];
                        const vb = this.mesh.vertices[b];
                        return Math.atan2(va.y - cy, va.x - cx) - Math.atan2(vb.y - cy, vb.x - cx);
                    });

                    return {
                        indices: allIdx,
                        color: f1.color, // Inherit one
                        alpha: (f1.alpha + f2.alpha) / 2
                    };
                };

                // Processing loop
                let workList = [...tempFaces];
                this.mesh.faces = [];

                while (workList.length > 0) {
                    let current = workList.shift();

                    // 40% chance to TRY merge
                    if (Math.random() < 0.4 && workList.length > 0) {
                        const neighborIdx = workList.findIndex(f => canMerge(current, f));
                        if (neighborIdx !== -1) {
                            const neighbor = workList.splice(neighborIdx, 1)[0];
                            current = mergeFaces(current, neighbor);

                            // 30% chance to merge again (Pentagon)
                            if (Math.random() < 0.3 && workList.length > 0) {
                                const neighbor2Idx = workList.findIndex(f => canMerge(current, f));
                                if (neighbor2Idx !== -1) {
                                    const neighbor2 = workList.splice(neighbor2Idx, 1)[0];
                                    current = mergeFaces(current, neighbor2);
                                }
                            }
                        }
                    }
                    this.mesh.faces.push(current);
                }

                // No rotation needed
                this.meshRotation = 0;
                // this.meshSpinSpeed = 0.05;

                // (Old shard logic removed)

                // --- Visual Spikes (Existing Logic) ---
                const count = params.visualSpikeCount || 15;
                const visualImgName = 'assets/ice_spike.png';

                const vImg = getCachedImage(visualImgName);

                for (let i = 0; i < count; i++) {
                    // Distribute spikes within the crystal shape roughly
                    const r = Math.sqrt(Math.random()) * (radius * 0.9);
                    const theta = Math.random() * 2 * Math.PI;
                    const rx = r * Math.cos(theta); // Relative to center
                    const ry = r * Math.sin(theta);

                    const scale = 0.4 + Math.random() * 0.4;
                    // --- Strict Wall Check (Spikes) ---
                    // Check center and edges of the base
                    const spikeW = 10 * scale;
                    if (game.map.isWall(this.x + rx, this.y + ry) || // Center
                        game.map.isWall(this.x + rx - spikeW / 2, this.y + ry) || // Left
                        game.map.isWall(this.x + rx + spikeW / 2, this.y + ry) // Right
                    ) continue;

                    this.visuals.push({
                        rx: rx,
                        ry: ry,
                        dist: r, // Distance from center
                        w: spikeW,
                        h: 0,
                        maxH: 46 * scale,
                        life: this.maxLife,
                        maxLife: this.maxLife,
                        image: vImg,
                        alpha: 1,
                        scale: scale
                    });
                }

                // --- Pre-calculate Face Centroids & Filter Walls (Strict) ---
                // Helper to check if a point is wall
                const isWall = (x, y) => game.map.isWall(this.x + x, this.y + y);

                this.mesh.faces = this.mesh.faces.filter(face => {
                    let sx = 0, sy = 0;
                    let hitWall = false;

                    // Check ALL vertices
                    face.indices.forEach(idx => {
                        const v = this.mesh.vertices[idx];
                        sx += v.x;
                        sy += v.y;
                        if (isWall(v.x, v.y)) hitWall = true;
                    });

                    if (hitWall) return false;

                    const cx = sx / face.indices.length;
                    const cy = sy / face.indices.length;

                    // Check Centroid too just in case
                    if (isWall(cx, cy)) return false;

                    face.cx = cx;
                    face.cy = cy;
                    face.dist = Math.hypot(cx, cy);
                    return true;
                });
            },

            update: function (dt) {
                if (!this.visualsInitialized) this.initVisuals();

                // Stationary: Do not update x/y to match user

                this.life -= dt;
                this.tickTimer += dt;

                // Rotate Mesh (Disabled)
                // if (this.mesh) {
                //     this.meshRotation += this.meshSpinSpeed * dt;
                // }

                // Update Visuals (Spikes)
                if (this.visuals) {
                    const elapsedTime = this.maxLife - this.life;
                    const waveSpeed = this.radius / 0.6; // Reach edge in 0.6s

                    this.visuals.forEach(v => {
                        // Calculate Delay based on distance
                        const delay = v.dist / waveSpeed;
                        const activeTime = elapsedTime - delay;

                        v.life = this.life; // Sync life if needed, but we use activeTime

                        if (activeTime < 0) {
                            v.h = 0; // Not appeared yet
                            v.alpha = 0;
                            return;
                        }

                        // Growth Animation
                        const growTime = 0.2;
                        if (activeTime < growTime) {
                            // Pop in: BackOut
                            const t = activeTime / growTime;
                            const s = 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);
                            v.h = v.maxH * s;
                            v.alpha = 1;
                        } else {
                            v.h = v.maxH;
                            v.alpha = 1;
                        }

                        // Fade out near end of life
                        if (this.life < 0.5) {
                            v.alpha = this.life / 0.5;
                        }
                    });
                }

                // 1. Apply SLOW to enemies in range
                // 2. Spawn Ice Spikes on enemies periodically
                const shouldSpawnSpike = this.tickTimer >= this.tickInterval;
                if (shouldSpawnSpike) this.tickTimer = 0;

                game.enemies.forEach(enemy => {
                    const dx = (enemy.x + enemy.width / 2) - this.x;
                    const dy = (enemy.y + enemy.height / 2) - this.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < this.radius) {
                        // Apply Slow (short duration, constantly reapplied)
                        if (enemy.statusManager) {
                            // 70% reduction => 0.3 multiplier
                            enemy.statusManager.applyStatus('slow', 0.2, 0.3);
                        }

                        // Spawn Spike
                        if (shouldSpawnSpike) {
                            // Use ice_spike behavior or spawnProjectile?
                            // Let's spawn a visual+damage spike at enemy location
                            // We can reuse spawnProjectile if we have an "ice_spike" preset, 
                            // OR manually define it. 
                            // Let's use a manual definition similar to ice_spike skill but instant/delayed-hit.
                            // Actually, let's just use spawnProjectile with 'ice_spike_burst' style?
                            // Simplified: Spawn a short-lived damage zone at enemy feet.

                            const img = getCachedImage('assets/ice_spike.png');

                            const spikeLife = 0.5;
                            const maxH = 46;

                            game.projectiles.push({
                                active: true,
                                x: enemy.x + enemy.width / 2 - 5, // Centerish (width 10)
                                y: enemy.y + enemy.height, // At feet
                                w: 10, h: 1, // Start height 1 (Visible)
                                type: 'projectile',
                                // layer: 'bottom', // Removed as per user request (normal Y-sort)
                                vx: 0, vy: 0,
                                life: spikeLife,
                                maxLife: spikeLife,
                                damage: params.damage,
                                color: '#00ffff', // Cyan backup
                                damageColor: params.damageColor, // Pass damageColor
                                aetherCharge: params.aetherCharge, // Pass charge
                                shape: 'triangle',
                                onHitEnemy: (e) => { }, // Prevent destruction

                                // Image Props
                                image: img,
                                frames: 1,
                                frameX: 0,
                                anchorY: 1.0, // Grow from bottom
                                fixedOrientation: true, // Don't rotate with velocity
                                noShake: true, // Disable camera shake for this skill

                                // Logic
                                maxH: maxH, // Target height
                                baseY: enemy.y + enemy.height, // Base position (feet)

                                update: function (dt) {
                                    this.life -= dt;

                                    // Growth Animation
                                    const timeAlive = this.maxLife - this.life;
                                    const growTime = 0.1;
                                    if (timeAlive < growTime) {
                                        this.h = this.maxH * (timeAlive / growTime);
                                    } else {
                                        this.h = this.maxH;
                                    }
                                    // Ensure we stay at the base Y (y is top-left usually, but with anchorY=1.0 in drawProjectile,
                                    // we draw relative to y. If we change h, and anchorY is 1.0, 
                                    // drawProjectile translates to y + h*1.0? 
                                    // Let's check drawProjectile logic:
                                    // this.ctx.translate(p.x + p.w * anchorX, p.y + p.h * anchorY);
                                    // So if y is fixed at feet, and h grows, and we want it to grow UP:
                                    // Y should clearly be the feet Y.
                                    // If h grows, the anchor point (feet) stays at p.y + p.h (bottom).
                                    // So p.y should simply be feet - p.h? 
                                    // NO. If we pass anchorY=1.0 to drawProjectile, it translates to y+h.
                                    // If we want that point to be "Feet", then Feet = y + h.
                                    // => y = Feet - h.
                                    // So as h changes, y must changes.

                                    this.y = this.baseY - this.h;

                                    // Damage Logic
                                    // Hit once when spike is fully extended (approx 50% life or just after growth)
                                    // Let's make it hit if enemy is still roughly over it.
                                    if (!this.hit && this.life < this.maxLife - 0.1) { // 0.1s delay (growth time)
                                        if (enemy && !enemy.markedForDeletion) {
                                            // Check overlap: Projectile W=10, Enemy W=32
                                            // Simple center distance check
                                            const ex = enemy.x + enemy.width / 2;
                                            const ey = enemy.y + enemy.height; // Feet
                                            const sx = this.x + this.w / 2;
                                            const sy = this.baseY; // Base of spike

                                            const dx = Math.abs(ex - sx);
                                            const dy = Math.abs(ey - sy);

                                            // Allow some leeway. 
                                            // Enemy width/2 + Spike width/2 = contact
                                            // Plus some vertical forgiveness
                                            if (dx < (enemy.width / 2 + 10) && dy < 20) {
                                                enemy.takeDamage(this.damage, this.damageColor, this.aetherCharge);
                                                game.spawnParticles(ex, ey - 10, 5, '#a5f2f3');
                                                // Camera shake removed per user request
                                            }
                                        }
                                        this.hit = true;
                                    }

                                    // Fade out
                                    if (this.life < 0.2) {
                                        // manual alpha handling if main.js doesn't
                                        // main.js handles fade on maxLife check usually
                                    }
                                }
                            });
                        }
                    }
                });
            },

            draw: function (ctx) {
                // console.log('IceGarden drawing. Visuals:', this.visuals ? this.visuals.length : 'null');
                // Draw Ice Garden Area
                ctx.save();
                ctx.translate(this.x, this.y);

                // Expansion Animation (Removed global scale)
                // const age = this.maxLife - this.life;
                // ... logic removed ...

                // Draw Polygon Layers (Crystal Effect)
                // Draw Mesh
                if (this.mesh) {
                    const elapsedTime = this.maxLife - this.life;
                    const waveSpeed = this.radius / 0.6; // Reach edge in 0.6s
                    const meshAlpha = 0.5 * Math.min(1.0, elapsedTime / 0.2); // Fade in mesh

                    // Draw Faces
                    this.mesh.faces.forEach(face => {
                        // Check if active based on distance
                        if (face.dist > waveSpeed * elapsedTime) return;

                        ctx.fillStyle = face.color;
                        ctx.globalAlpha = face.alpha * meshAlpha;
                        ctx.beginPath();
                        face.indices.forEach((idx, i) => {
                            const v = this.mesh.vertices[idx];
                            if (i === 0) ctx.moveTo(v.x, v.y);
                            else ctx.lineTo(v.x, v.y);
                        });
                        ctx.closePath();
                        ctx.fill();
                    });

                    // Draw Edges (Optional, low opacity for structure)
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 1; // Thinner
                    ctx.globalAlpha = 0.2 * meshAlpha;
                    this.mesh.faces.forEach(face => {
                        if (face.dist > waveSpeed * elapsedTime) return;

                        ctx.beginPath();
                        face.indices.forEach((idx, i) => {
                            const v = this.mesh.vertices[idx];
                            if (i === 0) ctx.moveTo(v.x, v.y);
                            else ctx.lineTo(v.x, v.y);
                        });
                        ctx.closePath();
                        ctx.stroke();
                    });
                }

                // Draw Visual Spikes
                if (this.visuals) {
                    this.visuals.forEach(v => {
                        if (v.alpha <= 0) return;
                        ctx.globalAlpha = v.alpha;
                        ctx.save();
                        // Anchor at bottom of spike
                        ctx.translate(v.rx, v.ry); // Relative to center
                        // Scale Y only for growth
                        const drawH = v.h;
                        if (drawH > 0) {
                            if (v.image.complete) {
                                // Draw from bottom up
                                // If image is 15x66, we draw it scaled
                                // v.w is logical width. v.maxH is logical height.
                                // We want to draw h pixels high.
                                // Source rect? or Scale? Let's scale.
                                const scaleY = drawH / v.maxH;
                                // ctx.scale(v.scale, v.scale * scaleY); // Uniform scale X, variable Y?
                                // Actually, let's just drawImage with dest dims
                                ctx.drawImage(v.image, -v.w / 2, -drawH, v.w, drawH);
                            } else {
                                ctx.fillStyle = '#00ffff';
                                ctx.fillRect(-v.w / 2, -drawH, v.w, drawH);
                            }
                        }
                        ctx.restore();
                    });
                }

                ctx.restore();
            }
        });
    },

    'thunderfall_storm': (user, game, params) => {
        // Direction based on Player Facing
        const startX = user.x + user.width / 2;
        const startY = user.y + user.height / 2;

        let dx = 0;
        let dy = 0;
        // user.facing is 'left', 'right', 'up', 'down'
        if (user.facing === 'left') dx = -1;
        else if (user.facing === 'right') dx = 1;
        else if (user.facing === 'up') dy = -1;
        else if (user.facing === 'down') dy = 1;
        else if (user.facing === 'up-left') { dx = -0.707; dy = -0.707; }
        else if (user.facing === 'up-right') { dx = 0.707; dy = -0.707; }
        else if (user.facing === 'down-left') { dx = -0.707; dy = 0.707; }
        else if (user.facing === 'down-right') { dx = 0.707; dy = 0.707; }

        // Fallback if no facing
        if (dx === 0 && dy === 0) dy = 1;

        const count = params.count || 8; // Number of bolts
        const spacing = params.spacing || 70; // Distance between bolts
        const interval = params.interval || 0.08; // Speed of propagation (fast)

        let spawnedCount = 0;
        let timer = 0;

        game.animations.push({
            type: 'logic',
            life: count * interval + 1.0,
            lateralOffset: 0, // Initialize random walk state

            update: function (dt) {
                if (spawnedCount >= count) {
                    this.life = 0;
                    return;
                }

                timer += dt;
                while (timer >= interval && spawnedCount < count) {
                    timer -= interval;
                    spawnedCount++;

                    const i = spawnedCount; // 1-based index

                    // Main Path (Forward)
                    let targetX = startX + (dx * spacing * i);
                    let targetY = startY + (dy * spacing * i);

                    // 1. Bolt from Sky
                    spawnLightningBolt(game, targetX, targetY, {
                        height: 600,
                        segments: 60, // Increased parts
                        deviation: 40, // Slightly reduced deviation for finer zigzag
                        thickness: 25, // Reduced size (thickness)
                        color: '#ffff00'
                    });

                    // 2. Impact Effect (Realism)
                    spawnThunderfallImpact(game, targetX, targetY);

                    // 3. Screen Shake
                    game.camera.shake(0.2, 8);

                    // 4. Damage Area (Instant)
                    const hitRadius = 50;
                    game.enemies.forEach(e => {
                        if (e.markedForDeletion) return;
                        const ex = e.x + e.width / 2;
                        const ey = e.y + e.height / 2;
                        if (Math.hypot(ex - targetX, ey - targetY) < hitRadius) {
                            e.takeDamage(params.damage, params.damageColor || '#ffff00', params.aetherCharge);
                            game.spawnParticles(ex, ey, 5, '#ffff00');
                        }
                    });
                }
            }
        });
    },

    'global_strike': (user, game, params) => {
        // 1. Initial Blast at user location
        const initialShakePower = 8;
        const initialShakeDuration = 0.4;
        game.camera.shake(initialShakeDuration, initialShakePower);

        // 2. Determine Directions
        const isRush = user.isAetherRush;
        const angles = [];
        if (isRush) {
            // 8 directions
            for (let i = 0; i < 8; i++) angles.push((i * Math.PI) / 4);
        } else {
            // 4 directions (Cardinal)
            for (let i = 0; i < 4; i++) angles.push((i * Math.PI) / 2);
        }

        // 3. Create Strike Queue (3 waves of increasing distance)
        const strikeQueue = [];
        const waveCount = params.count || 3;
        const waveSpacing = 80;
        const waveInterval = 0.12;

        for (let w = 0; w < waveCount; w++) {
            const dist = (w + 1) * waveSpacing;
            const delay = w * waveInterval;

            angles.forEach(angle => {
                const tx = user.x + Math.cos(angle) * dist;
                const ty = user.y + Math.sin(angle) * dist;

                strikeQueue.push({
                    x: tx,
                    y: ty,
                    delay: delay
                });
            });
        }

        // 4. Spawn Logic Entity to process queue
        game.animations.push({
            type: 'logic',
            life: (waveCount * waveInterval) + 0.5,
            timer: 0,
            queue: strikeQueue,
            update: function (dt) {
                this.timer += dt;

                while (this.queue.length > 0 && this.queue[0].delay <= this.timer) {
                    const strike = this.queue.shift();
                    const sx = strike.x;
                    const sy = strike.y;

                    // Damage all enemies in radius
                    const radius = 60;
                    game.enemies.forEach(e => {
                        if (!e.markedForDeletion) {
                            const dx = e.x + e.width / 2 - sx;
                            const dy = e.y + e.height / 2 - sy;
                            if (Math.hypot(dx, dy) < radius) {
                                e.takeDamage(params.damage || 20, params.damageColor || '#ffff00', params.aetherCharge);
                            }
                        }
                    });

                    // Visuals
                    spawnLightningBolt(game, sx, sy, {
                        height: 800, segments: 30, deviation: 50, thickness: 50, color: '#ffff00', life: 0.1
                    });
                    spawnThunderfallImpact(game, sx, sy, 1.8);

                    // Camera Shake
                    game.camera.shake(0.12, isRush ? 3 : 5);
                }

                if (this.queue.length === 0) this.life = 0;
            }
        });
    },

    'phoenix_dive': function (user, game, params) {
        // Aether Rush Modifiers
        let speed = params.speed || 1200;
        let duration = params.duration || 0.4;
        let damage = params.damage || 15;
        const skillInstance = this;

        if (user.isAetherRush) {
            // Aether Rush Modifiers - Removed for Primary skill policy
        }

        let dx = 0, dy = 0;
        if (user.facing === 'left') dx = -1;
        else if (user.facing === 'right') dx = 1;
        else if (user.facing === 'up') dy = -1;
        else if (user.facing === 'down') dy = 1;
        else if (user.facing === 'up-left') { dx = -0.707; dy = -0.707; }
        else if (user.facing === 'up-right') { dx = 0.707; dy = -0.707; }
        else if (user.facing === 'down-left') { dx = -0.707; dy = 0.707; }
        else if (user.facing === 'down-right') { dx = 0.707; dy = 0.707; }

        if (dx === 0 && dy === 0) dy = 1;

        user.isCasting = true;
        user.invulnerable = duration + 0.1;

        let killCount = 0;

        // JSON Data Logic
        if (params.spriteData && !params._loadedFrames) {
            if (!window.spriteDataCache) window.spriteDataCache = {};
            if (window.spriteDataCache[params.spriteData]) {
                params._loadedFrames = window.spriteDataCache[params.spriteData];
            } else {
                params._loadedFrames = [];
                fetch(params.spriteData)
                    .then(r => r.json())
                    .then(data => {
                        const keys = Object.keys(data.frames).sort();
                        const frames = keys.map(k => data.frames[k].frame);
                        params._loadedFrames.push(...frames);
                        window.spriteDataCache[params.spriteData] = params._loadedFrames;
                    })
                    .catch(e => console.error("Failed to load sprite data", e));
            }
        }

        // Visual Aura
        const aura = {
            type: 'animation',
            x: user.x, y: user.y,
            w: 120, h: 120,
            life: duration,
            maxLife: duration,
            image: params.spriteSheet ? getCachedImage(params.spriteSheet) : null,
            frames: params.frames || 1,
            frameX: 0, frameTimer: 0, frameRate: 0.05,
            rotation: Math.atan2(dy, dx),
            update: function (dt) {
                this.life -= dt;
                this.x = user.x + user.width / 2 - this.w / 2;
                this.y = user.y + user.height / 2 - this.h / 2;

                // Sync frame to player direction if there are multiple frames (Right=0, Left=1, Up=2, Down=3)
                const frameCount = (params._loadedFrames && params._loadedFrames.length > 0) ? params._loadedFrames.length : this.frames;
                if (frameCount >= 4) {
                    if (user.facing.includes('right')) this.frameX = 0;
                    else if (user.facing.includes('left')) this.frameX = 1;
                    else if (user.facing.includes('up')) this.frameX = 2;
                    else if (user.facing.includes('down')) this.frameX = 3;
                } else if (frameCount > 1) {
                    // Traditional time-based animation for non-directional sheets
                    this.frameTimer += dt;
                    if (this.frameTimer >= this.frameRate) {
                        this.frameTimer = 0;
                        this.frameX = (this.frameX + 1) % frameCount;
                    }
                }
            },
            draw: function (ctx) {
                if (this.image && this.image.complete) {
                    ctx.save();
                    ctx.translate(this.x + this.w / 2, this.y + this.h / 2);

                    const frameCount = (params._loadedFrames && params._loadedFrames.length > 0) ? params._loadedFrames.length : this.frames;
                    // Only rotate if NOT using directional frames
                    if (frameCount < 4) {
                        ctx.rotate(this.rotation);
                    }

                    // Flip vertically only for Down direction (Frame 3)
                    if (frameCount >= 4 && this.frameX === 3) {
                        ctx.scale(1, -1);
                    }

                    ctx.globalAlpha = 0.6;

                    const frameData = (params._loadedFrames && params._loadedFrames.length > this.frameX) ? params._loadedFrames[this.frameX] : null;

                    if (frameData) {
                        ctx.drawImage(
                            this.image,
                            frameData.x, frameData.y, frameData.w, frameData.h,
                            -this.w / 2, -this.h / 2, this.w, this.h
                        );
                    } else {
                        const frameW = this.image.width / this.frames;
                        ctx.drawImage(this.image, this.frameX * frameW, 0, frameW, this.image.height, -this.w / 2, -this.h / 2, this.w, this.h);
                    }
                    ctx.restore();
                } else {
                    ctx.save();
                    ctx.translate(this.x + this.w / 2, this.y + this.h / 2);
                    ctx.rotate(this.rotation);
                    ctx.fillStyle = 'rgba(255, 100, 0, 0.5)';
                    ctx.beginPath();
                    ctx.moveTo(this.w / 2, 0);
                    ctx.lineTo(-this.w / 2, -this.h / 3);
                    ctx.lineTo(-this.w / 2, this.h / 3);
                    ctx.closePath();
                    ctx.fill();
                    ctx.restore();
                }
            }
        };
        game.animations.push(aura);

        game.animations.push({
            type: 'logic',
            life: duration,
            hitEnemies: new Set(),
            update: function (dt) {
                this.life -= dt;
                user.vx = dx * speed;
                user.vy = dy * speed;
                user.keepVelocity = true;
                user.isCasting = true;

                // --- Beautiful Trail Effect ---
                this.ghostTimer = (this.ghostTimer || 0) + dt;
                if (this.ghostTimer > 0.02) {
                    this.ghostTimer = 0;
                    // Spawn afterimage of the aura
                    game.animations.push({
                        type: 'animation',
                        x: aura.x, y: aura.y,
                        w: aura.w, h: aura.h,
                        image: aura.image,
                        frames: aura.frames,
                        frameX: aura.frameX,
                        rotation: aura.rotation,
                        life: 0.3,
                        maxLife: 0.3,
                        draw: function (ctx) {
                            ctx.save();
                            ctx.translate(this.x + this.w / 2, this.y + this.h / 2);
                            if (this.frames < 4) ctx.rotate(this.rotation);
                            if (this.frames >= 4 && this.frameX === 3) ctx.scale(1, -1);
                            ctx.globalAlpha = (this.life / this.maxLife) * 0.3;

                            const frameData = (params._loadedFrames && params._loadedFrames.length > this.frameX) ? params._loadedFrames[this.frameX] : null;
                            if (frameData) {
                                ctx.drawImage(this.image, frameData.x, frameData.y, frameData.w, frameData.h, -this.w / 2, -this.h / 2, this.w, this.h);
                            } else {
                                const frameW = this.image.width / this.frames;
                                ctx.drawImage(this.image, this.frameX * frameW, 0, frameW, this.image.height, -this.w / 2, -this.h / 2, this.w, this.h);
                            }
                            ctx.restore();
                        }
                    });
                    // Particles along the trail (Increased for richer sparks)
                    // Blowing back opposite to dash direction
                    const blowBackX = -dx * speed * 0.3;
                    const blowBackY = -dy * speed * 0.3;

                    for (let i = 0; i < 3; i++) {
                        game.spawnParticles(
                            user.x + user.width / 2 + (Math.random() - 0.5) * 20,
                            user.y + user.height / 2 + (Math.random() - 0.5) * 20,
                            3,
                            '#ffcc00',
                            blowBackX,
                            blowBackY
                        );
                    }
                }
                // -----------------------------

                const radius = 50;
                const cx = user.x + user.width / 2;
                const cy = user.y + user.height / 2;

                game.enemies.forEach(e => {
                    if (!this.hitEnemies.has(e) && !e.markedForDeletion) {
                        const edx = (e.x + e.width / 2) - cx;
                        const edy = (e.y + e.height / 2) - cy;
                        if (Math.hypot(edx, edy) < radius) {
                            e.takeDamage(damage, '#ffcc00', params.aetherCharge || 0);
                            this.hitEnemies.add(e);
                            if (e.hp <= 0 || e.markedForDeletion) killCount++;
                            game.spawnParticles(e.x + e.width / 2, e.y + e.height / 2, 5, '#ff8800');
                        }
                    }
                });

                if (this.life <= 0) {
                    user.isCasting = false;
                    user.vx = 0; user.vy = 0;
                    if (killCount > 0 && skillInstance) {
                        skillInstance.currentCooldown = 0;
                        skillInstance.stacks = skillInstance.maxStacks;
                        game.spawnParticles(user.x + user.width / 2, user.y + user.height / 2, 15, '#ffff00');
                        console.log("Phoenix Dive Reset! Kills:", killCount);
                    }
                }
            }
        });
    },

    'glacial_lotus': (user, game, params) => {
        const petalCount = params.petalCount || 12;
        const bloomRadius = params.bloomRadius || 60;
        const bloomDuration = params.bloomDuration || 0.8;
        const angleStep = (Math.PI * 2) / petalCount;
        const isCastInRush = user.isAetherRush;

        // Scaling for Normal Mode (30% reduction)
        const sizeScale = isCastInRush ? 1.0 : 0.7;
        const adjustedParams = {
            ...params,
            width: (params.width || 24) * sizeScale,
            height: (params.height || 60) * sizeScale
        };

        // SFX/Visual Feed for Activation
        if (game.camera) game.camera.shake(0.3, 8);

        // Create "Petals" (Projectiles that follow the user during bloom)
        const petals = [];
        for (let i = 0; i < petalCount; i++) {
            const angle = i * angleStep;
            const proj = spawnProjectile(game, user.x, user.y, 0, 0, {
                ...adjustedParams,
                damage: 0,
                onHitEnemy: () => { }, // Disable damage during bloom
                onHitWall: () => { },
                ignoreWallDestruction: true,
                noTrail: true,
                noShake: true,
                rotation: angle,
                life: bloomDuration + (params.burstLife || 1.2)
            });
            proj._lotusAngle = angle;
            petals.push(proj);
        }

        // Logic entity to handle the bloom movement and burst transition
        game.animations.push({
            type: 'logic',
            life: bloomDuration,
            update: function (dt) {
                this.life -= dt;

                // Keep spikes in orbit
                const cx = user.x + user.width / 2;
                const cy = user.y + user.height / 2;
                petals.forEach(p => {
                    if (!p.active) return;
                    p.x = cx + Math.cos(p._lotusAngle) * bloomRadius - p.w / 2;
                    p.y = cy + Math.sin(p._lotusAngle) * bloomRadius - p.h / 2;
                    p.rotation = p._lotusAngle;
                });

                if (this.life <= 0 || bloomDuration <= 0) {
                    // BURST!
                    if (game.camera) game.camera.shake(0.5, 12);
                    spawnIceShatter(game, cx, cy, 15); // Center burst

                    petals.forEach(p => {
                        if (!p.active) return;
                        p.vx = Math.cos(p._lotusAngle) * (params.burstSpeed || 900);
                        p.vy = Math.sin(p._lotusAngle) * (params.burstSpeed || 900);
                        p.damage = params.damage || 30;
                        p.ignoreWallDestruction = false;
                        p.noTrail = false;
                        p.iceTrail = true;
                        p.ghostTrail = true;
                        p.ghostFilter = 'brightness(1.5) hue-rotate(-20deg)';
                        p.ghostInterval = 0.04;
                        p.noShake = true;

                        // Restore Hit Handler
                        p.onHitEnemy = function (enemy, gameInstance) {
                            enemy.takeDamage(this.damage, this.damageColor, this.aetherCharge);
                            spawnIceShatter(gameInstance, this.x + this.width / 2, this.y + this.height / 2, 6);

                            // Aether Rush Scatter Effect
                            if (isCastInRush) {
                                for (let i = 0; i < 3; i++) {
                                    const angle = Math.random() * Math.PI * 2;
                                    const speed = (params.burstSpeed || 900) * 0.6;
                                    spawnProjectile(gameInstance, this.x + this.width / 2, this.y + this.height / 2, Math.cos(angle) * speed, Math.sin(angle) * speed, {
                                        ...params,
                                        damage: 5,
                                        width: this.width * 0.5,
                                        height: this.height * 0.5,
                                        isAetherRush: false, // Prevent infinite loops
                                        iceTrail: true,
                                        ghostTrail: true,
                                        ghostInterval: 0.1,
                                        pierce: 999,
                                        life: 0.6
                                    });
                                }
                            }

                            if (!isCastInRush) {
                                this.life = 0; // Disable pierce for normal spikes
                            }
                        };
                        p.onHitWall = function (gameInstance) {
                            spawnIceShatter(gameInstance, this.x + this.width / 2, this.y + this.height / 2, 6);

                            // Aether Rush Scatter Effect
                            if (isCastInRush) {
                                for (let i = 0; i < 3; i++) {
                                    const angle = Math.random() * Math.PI * 2;
                                    const speed = (params.burstSpeed || 900) * 0.6;
                                    spawnProjectile(gameInstance, this.x + this.width / 2, this.y + this.height / 2, Math.cos(angle) * speed, Math.sin(angle) * speed, {
                                        ...params,
                                        damage: 5,
                                        width: this.width * 0.5,
                                        height: this.height * 0.5,
                                        isAetherRush: false, // Prevent infinite loops
                                        iceTrail: true,
                                        ghostTrail: true,
                                        ghostInterval: 0.1,
                                        pierce: 999,
                                        life: 0.6
                                    });
                                }
                            }

                            this.life = 0;
                        };
                    });

                    if (bloomDuration <= 0) this.life = 0;
                }
            }
        });
    },
    'magma_core': (user, game, params) => {
        const duration = params.duration || 8.0;
        const orbitRadius = params.orbitRadius || 80;
        const coreRadius = params.coreRadius || 18;
        let rotationSpeed = params.rotationSpeed || 3.5;
        if (user.isAetherRush) rotationSpeed *= 2.0;
        const count = user.isAetherRush ? 4 : 2;

        const pDamage = params.puddleDamage || 5;
        const pLife = params.puddleLife || 3.0;

        game.animations.push({
            type: 'magma_core_controller',
            life: duration,
            maxLife: duration,
            angle: 0,
            cores: [],
            init: function () {
                for (let i = 0; i < count; i++) {
                    this.cores.push({
                        angleOffset: (i / count) * Math.PI * 2,
                        puddleTimers: new Map() // Enemy -> Cooldown
                    });
                }
            },
            update: function (dt) {
                if (this.cores.length === 0) this.init();
                this.life -= dt;
                this.age = (this.age || 0) + dt;
                const spawnRatio = Math.min(1.0, this.age / 0.5);
                const despawnRatio = Math.min(1.0, this.life / 0.5);
                const finalRatio = spawnRatio * despawnRatio;

                const currentOrbit = orbitRadius * finalRatio;
                const currentCore = coreRadius * finalRatio;

                this.angle += rotationSpeed * dt;
                this.selfAngle = (this.selfAngle || 0) + (rotationSpeed * 2.5 * dt);

                const cx = user.x + user.width / 2;
                const cy = user.y + user.height / 2;

                this.cores.forEach(c => {
                    const angle = this.angle + c.angleOffset;
                    const x = cx + Math.cos(angle) * currentOrbit;
                    const y = cy + Math.sin(angle) * currentOrbit;

                    // Update Puddle Cooldowns
                    for (let [e, t] of c.puddleTimers) {
                        if (t > 0) c.puddleTimers.set(e, t - dt);
                        else c.puddleTimers.delete(e);
                    }

                    // Direct Damage & On-Hit Eruption
                    game.enemies.forEach(e => {
                        const ex = (e.x + e.width / 2) - x;
                        const ey = (e.y + e.height / 2) - y;
                        if (Math.hypot(ex, ey) < currentCore) {
                            // Critical hit roll
                            const isCrit = params.critChance > 0 && Math.random() < params.critChance;
                            const finalDamage = isCrit ? params.damage * (params.critMultiplier || 2.0) : params.damage;

                            e.takeDamage(finalDamage, params.damageColor, params.aetherCharge || 0, isCrit);

                            // Apply Status
                            if (params.statusEffect && Math.random() < (params.statusChance || 0)) {
                                if (e.statusManager) {
                                    e.statusManager.applyStatus(params.statusEffect, 5.0);
                                }
                            }

                            game.spawnParticles(e.x + e.width / 2, e.y + e.height / 2, isCrit ? 6 : 2, params.damageColor);

                            // Eruption Trigger
                            let pTimer = c.puddleTimers.get(e) || 0;
                            if (pTimer <= 0) {
                                c.puddleTimers.set(e, 0.4); // Cooldown to prevent spam

                                const enemyFeetX = e.x + e.width / 2;
                                const enemyFeetY = e.y + e.height;

                                for (let i = 0; i < 3; i++) {
                                    const ox = (Math.random() - 0.5) * 40;
                                    const oy = (Math.random() - 0.5) * 20;

                                    game.animations.push({
                                        type: 'magma_puddle',
                                        layer: 'bottom',
                                        x: enemyFeetX + ox,
                                        y: enemyFeetY + oy,
                                        radius: 20,
                                        life: pLife,
                                        maxLife: pLife,
                                        damage: pDamage,
                                        slow: 0.5,
                                        hitEnemies: new Map(),
                                        randSeed: Math.random() * 100,
                                        randHeight: 0.8 + Math.random() * 0.4,
                                        randSpeed: 0.9 + Math.random() * 0.2,
                                        update: function (dt2) {
                                            this.life -= dt2;
                                            if (Math.random() < 0.5) {
                                                const isSmoke = Math.random() < 0.3;
                                                game.spawnParticles(
                                                    this.x + (Math.random() - 0.5) * this.radius * 0.4,
                                                    this.y,
                                                    1,
                                                    isSmoke ? '#333333' : (Math.random() < 0.5 ? '#ff4400' : '#ffbb00'),
                                                    (Math.random() - 0.5) * 12,
                                                    -60 - Math.random() * 60,
                                                    { shape: 'circle', shrink: true, size: 6 + Math.random() * 4 }
                                                );
                                            }
                                            game.enemies.forEach(e2 => {
                                                const ex2 = (e2.x + e2.width / 2) - this.x;
                                                const ey2 = (e2.y + e2.height / 2) - this.y;
                                                if (Math.hypot(ex2, ey2) < this.radius) {
                                                    e2.tempSlow = 0.2;
                                                    e2.slowMultiplier = this.slow;
                                                    let tickTimer = this.hitEnemies.get(e2) || 0;
                                                    tickTimer -= dt2;
                                                    if (tickTimer <= 0) {
                                                        const isCrit = false;
                                                        const finalDamage = this.damage;

                                                        e2.takeDamage(finalDamage, '#ff4400', params.puddleAetherCharge || 0, isCrit);

                                                        // Apply Status
                                                        if (params.statusEffect && Math.random() < (params.statusChance || 0)) {
                                                            if (e2.statusManager) {
                                                                e2.statusManager.applyStatus(params.statusEffect, 5.0);
                                                            }
                                                        }

                                                        this.hitEnemies.set(e2, 0.5);
                                                        game.spawnParticles(e2.x + e2.width / 2, e2.y + e2.height / 2, 2, '#ff4400');
                                                    } else {
                                                        this.hitEnemies.set(e2, tickTimer);
                                                    }
                                                }
                                            });
                                        },
                                        draw: function (ctx) {
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
                            }
                        }
                    });
                });
            },
            draw: function (ctx) {
                const cx = user.x + user.width / 2;
                const cy = user.y + user.height / 2;
                const sprite = params.spriteSheet ? getCachedImage(params.spriteSheet) : null;

                const spawnRatio = Math.min(1.0, (this.age || 0) / 0.5);
                const despawnRatio = Math.min(1.0, this.life / 0.5);
                const finalRatio = spawnRatio * despawnRatio;

                const currentOrbit = orbitRadius * finalRatio;
                const currentCore = coreRadius * finalRatio;

                this.cores.forEach(c => {
                    const angle = this.angle + c.angleOffset;
                    const x = cx + Math.cos(angle) * currentOrbit;
                    const y = cy + Math.sin(angle) * currentOrbit;

                    ctx.save();

                    if (sprite) {
                        ctx.translate(x, y);
                        ctx.rotate(this.selfAngle);
                        ctx.drawImage(sprite, -currentCore, -currentCore, currentCore * 2, currentCore * 2);
                    } else {
                        // Fallback to procedural glow
                        const grad = ctx.createRadialGradient(x, y, 0, x, y, currentCore * 1.5);
                        grad.addColorStop(0, '#ffbb00');
                        grad.addColorStop(1, 'rgba(255, 68, 0, 0)');
                        ctx.fillStyle = grad;
                        ctx.globalAlpha = 0.6;
                        ctx.beginPath(); ctx.arc(x, y, currentCore * 1.5, 0, Math.PI * 2); ctx.fill();
                        ctx.globalAlpha = 1.0;
                        ctx.fillStyle = '#ffffff';
                        ctx.beginPath(); ctx.arc(x, y, currentCore * 0.6, 0, Math.PI * 2); ctx.fill();
                        ctx.strokeStyle = '#ffff00';
                        ctx.lineWidth = 3;
                        ctx.beginPath(); ctx.arc(x, y, currentCore * 0.8, 0, Math.PI * 2); ctx.stroke();
                    }
                    ctx.restore();

                    if (Math.random() < 0.3) {
                        game.spawnParticles(x, y, 1, '#ffaa00', 0, 0, { shape: 'circle', shrink: true, size: 4 });
                    }
                });
            }
        });
    },

    'volt_drive': (user, game, params) => {
        // 1. Set Player State
        user.voltDriveTimer = params.duration || 8;
        user.voltDriveParams = params;

        // Aether Rush Extension
        if (user.isAetherRush) {
            user.voltDriveTimer *= 1.5;
        }

        // 2. Global Visual Activation (YELLOW)
        if (game.camera) game.camera.shake(0.3, 10);
        spawnAetherExplosion(game, user.x + user.width / 2, user.y + user.height / 2, {
            ringColor: 'rgba(255, 255, 0, 0.7)',
            particleColor: 'rgba(255, 255, 100, 0.8)'
        });

        // 3. Range Indicator (Around Player)
        game.animations.push({
            type: 'animation',
            life: user.voltDriveTimer,
            draw: function (ctx) {
                if (user.voltDriveTimer <= 0) {
                    this.life = 0;
                    return;
                }
                ctx.save();
                ctx.strokeStyle = 'rgba(255, 255, 0, 0.2)';
                ctx.lineWidth = 2;
                ctx.setLineDash([5, 5]);
                ctx.beginPath();
                ctx.arc(user.x + user.width / 2, user.y + user.height / 2, params.chainRange || 300, 0, Math.PI * 2);
                ctx.stroke();

                // Pulsing fill
                const pulse = (Math.sin(Date.now() / 200) + 1) * 0.05;
                ctx.fillStyle = `rgba(255, 255, 0, ${pulse})`;
                ctx.fill();
                ctx.restore();
            },
            update: function (dt) {
                this.life = user.voltDriveTimer;
            }
        });

        // 4. Auto-firing Logic Spawner
        let lightningTimer = 0;
        game.animations.push({
            type: 'logic',
            life: user.voltDriveTimer + 1.0, // Buffer
            update: function (dt) {
                if (user.voltDriveTimer <= 0) {
                    this.life = 0;
                    return;
                }

                lightningTimer += dt;
                const interval = user.isAetherRush ? (params.autoLightningInterval * 0.7) : params.autoLightningInterval;
                if (lightningTimer >= interval) {
                    lightningTimer = 0;

                    // Find nearest enemy within range
                    let nearest = null;
                    let minDist = Infinity;
                    const range = params.chainRange || 300;

                    game.enemies.forEach(e => {
                        if (e.markedForDeletion) return;
                        const d = Math.hypot(e.x - user.x, e.y - user.y);
                        if (d < range && d < minDist) {
                            minDist = d;
                            nearest = e;
                        }
                    });

                    if (nearest) {
                        // --- Strike Indicator (Telegraph) ---
                        const tx = nearest.x + nearest.width / 2;
                        const ty = nearest.y + nearest.height / 2;

                        game.animations.push({
                            type: 'ring',
                            x: tx, y: ty,
                            radius: 40, maxRadius: 10, // Shrinking ring
                            width: 3,
                            life: 0.1, maxLife: 0.1,
                            color: '#ffff00'
                        });

                        // Small delay for the bolt
                        setTimeout(() => {
                            if (nearest.markedForDeletion) return;

                            // Visual Bolt (Sky to Ground like Thunderfall)
                            spawnLightningBolt(game, tx, ty, {
                                height: 600,
                                segments: 60,
                                deviation: 40,
                                thickness: 25,
                                color: '#ffff00',
                                life: 0.1
                            });

                            // Impact Effect
                            spawnThunderfallImpact(game, tx, ty);

                            // Damage Logic
                            const damage = params.damage || 5;
                            const isCrit = Math.random() < (params.critChance || 0);
                            const finalDmg = isCrit ? damage * (params.critMultiplier || 2.0) : damage;

                            nearest.takeDamage(finalDmg, params.damageColor || '#ffff00', 0, isCrit);
                            spawnLightningBurst(game, nearest.x + nearest.width / 2, nearest.y + nearest.height / 2, {
                                burstCount: 4, burstSize: 30, burstSpeed: 100
                            });

                            // --- Multi-jump Chain Logic ---
                            const baseChain = params.chainCount || 3;
                            let chainCount = user.isAetherRush ? (baseChain + 2) : baseChain;
                            let hitIds = new Set([nearest.id]);

                            const triggerJump = (fromEnemy, remaining) => {
                                if (remaining <= 0) return;

                                let next = null;
                                let minDist = Infinity;
                                const fx = fromEnemy.x + fromEnemy.width / 2;
                                const fy = fromEnemy.y + fromEnemy.height / 2;
                                const cRange = range * 1.5; // Slightly more forgiving for chains

                                game.enemies.forEach(e => {
                                    if (e.markedForDeletion || hitIds.has(e.id)) return;
                                    const ex = e.x + e.width / 2;
                                    const ey = e.y + e.height / 2;
                                    const d = Math.hypot(ex - fx, ey - fy);
                                    if (d < cRange && d < minDist) {
                                        minDist = d;
                                        next = e;
                                    }
                                });

                                if (next) {
                                    hitIds.add(next.id);

                                    const nx = next.x + next.width / 2;
                                    const ny = next.y + next.height / 2;

                                    // Calculate direction and speed for the "contagious" arc
                                    const angle = Math.atan2(ny - fy, nx - fx);
                                    const dist = Math.hypot(nx - fx, ny - fy);
                                    const arcSpeed = 1000; // Slightly slower for better visibility
                                    const duration = dist / arcSpeed;

                                    // Spawn the moving electricity arc (visual projectile)
                                    // spriteSheet is necessary for rendering in main.js
                                    spawnProjectile(game, fx, fy, Math.cos(angle) * arcSpeed, Math.sin(angle) * arcSpeed, {
                                        visual: true,
                                        spriteSheet: 'assets/lightning_part_01.png',
                                        life: duration,
                                        width: 60,
                                        height: 20,
                                        color: '#ffff00',
                                        crackle: true,
                                        crackleColor: '#ffff00',
                                        noTrail: true,
                                        fixedOrientation: true,
                                        rotation: angle,
                                        filter: 'sepia(1) saturate(10) hue-rotate(0deg) brightness(1.2)',
                                        blendMode: 'lighter'
                                    });

                                    // Wait for the arc to reach the target before triggering the next step
                                    setTimeout(() => {
                                        if (next.markedForDeletion) return;

                                        // Impact Visuals
                                        spawnLightningBurst(game, nx, ny, {
                                            burstCount: 4, burstSize: 30, burstSpeed: 100
                                        });

                                        // Damage Logic
                                        next.takeDamage(damage * 0.7, '#ffff00', 0);

                                        // Recursive Jump
                                        triggerJump(next, remaining - 1);
                                    }, duration * 1000);
                                }
                            };

                            if (chainCount > 0) {
                                triggerJump(nearest, chainCount);
                            }
                        }, 60); // End of setTimeout
                    }
                }
            }
        });
    },
};
