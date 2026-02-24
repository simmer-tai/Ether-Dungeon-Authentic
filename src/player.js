import { Entity, getCachedImage } from './utils.js';
import { SkillType, spawnAetherExplosion } from './skills/index.js';

export class Player extends Entity {
    constructor(game, x, y) {
        super(game, x, y, 20, 20, '#4488ff', 100);
        this.speed = 250;
        this.facing = 'right';
        this.isDashing = false;
        this.isCasting = false; // Added flag
        this.dashVx = 0;
        this.dashVy = 0;

        this.dashCooldown = 1.0;
        this.dashTimer = 0;
        this.canDash = true;
        this.dashDuration = 0.15;
        this.dashSpeed = 800;

        this.inventory = [];
        this.equippedSkills = {
            [SkillType.NORMAL]: null,
            'primary1': null,
            'primary2': null,
            [SkillType.SECONDARY]: null,
            [SkillType.ULTIMATE]: null
        };

        // Charge State
        this.chargingSkillSlot = null;
        this.chargeTimer = 0;
        this.maxChargeTime = 0;
        this.isCharging = false;

        this.scale = 1.0;
        this.alpha = 1.0;

        this.image = getCachedImage('assets/player_sprites.png');
        const checkLoad = () => {
            if (this.image.complete && this.image.naturalWidth !== 0) {
                this.rawSpriteWidth = this.image.width / 4;
                this.rawSpriteHeight = this.image.height / 4;
            } else {
                this.image.onload = () => {
                    this.rawSpriteWidth = this.image.width / 4;
                    this.rawSpriteHeight = this.image.height / 4;
                };
            }
        };
        checkLoad();

        // Sprite animation properties
        this.frameX = 0;
        this.frameY = 0; // Row: 0=Down, 1=Left, 2=Right, 3=Up
        this.maxFrames = 4; // Columns
        this.frameTimer = 0;
        this.frameInterval = 0.1; // Faster animation speed
        this.rawSpriteWidth = 32; // Default fallback
        this.rawSpriteHeight = 32; // Default fallback

        // Tuning properties to handle gaps in AI sprite sheets
        this.spritePaddingX = 40; // Pixels to trim from left/right
        this.spritePaddingY = 20; // Pixels to trim from top/bottom

        this.width = 30; // Reduce collision box slightly
        this.height = 30;

        this.damageColor = '#ff3333'; // Player takes red damage text


        // Currency
        this.currency = 0;

        // Aether Rush System
        this.aetherGauge = 0;
        this.maxAetherGauge = 100;
        this.isAetherRush = false;
        this.aetherRushDuration = 15.0;
        this.aetherRushTimer = 0;

        // Load Sprite JSON
        this.spriteData = null;
        fetch('assets/player_sprites.json')
            .then(response => response.json())
            .then(data => {
                this.spriteData = data;
                console.log('Player sprite data loaded:', this.spriteData);
            })
            .catch(err => console.error('Failed to load sprite JSON:', err));

        this.bloodBlessings = [];
        this.voltDriveTimer = 0;
        this.voltDriveParams = null;
    }

    get damageMultiplier() {
        let mult = 1.0;
        if (this.bloodBlessings) {
            this.bloodBlessings.forEach(b => {
                if (b.buff && b.buff.damageMult) mult *= b.buff.damageMult;
            });
        }
        if (this.isAetherRush) mult *= 1.2;
        return mult;
    }

    get actualSpeed() {
        let mult = 1.0;
        if (this.bloodBlessings) {
            this.bloodBlessings.forEach(b => {
                if (b.buff && b.buff.speedMult) mult *= b.buff.speedMult;
            });
        }
        if (this.voltDriveTimer > 0 && this.voltDriveParams) {
            mult *= (this.voltDriveParams.speedMult || 1.8);
        }
        return 250 * mult;
    }

    get aetherMultiplier() {
        let mult = 1.0;
        if (this.bloodBlessings) {
            this.bloodBlessings.forEach(b => {
                if (b.buff && b.buff.aetherGainMult) mult *= b.buff.aetherGainMult;
            });
        }
        return mult;
    }

    addCurrency(amount) {
        this.currency += amount;
        // console.log(`Currency: ${this.currency} (+${amount})`);
    }

    acquireSkill(skill) {
        if (!skill) return false;

        // Check for duplicates
        const exists = this.inventory.some(s => s.id === skill.id);
        if (exists) {
            console.log(`Skill already possessed: ${skill.name}`);
            return false;
        }

        this.inventory.push(skill);
        console.log(`Acquired new skill: ${skill.name}`);
        return true;
    }

    equipSkill(skill, slot) {
        if (skill.type === SkillType.PRIMARY) {
            // For primary, we need a specific slot (primary1 or primary2)
            if (slot === 'primary1' || slot === 'primary2') {
                this.equippedSkills[slot] = skill;
                console.log(`Equipped ${skill.name} to ${slot}`);
            } else {
                // Default to primary1 if undefined? Or find empty?
                if (!this.equippedSkills['primary1']) this.equippedSkills['primary1'] = skill;
                else if (!this.equippedSkills['primary2']) this.equippedSkills['primary2'] = skill;
                else this.equippedSkills['primary1'] = skill; // Overwrite 1
                console.log(`Auto-equipped ${skill.name} to Primary slot`);
            }
        } else if (Object.values(SkillType).includes(skill.type)) {
            this.equippedSkills[skill.type] = skill;
            console.log(`Equipped ${skill.name} to ${skill.type}`);
        }
    }

    update(dt) {
        if (!this.keepVelocity) {
            this.vx = 0;
            this.vy = 0;
        }
        this.keepVelocity = false;
        let moving = false;

        if (this.isDashing) {
            this.vx = this.dashVx;
            this.vy = this.dashVy;
            moving = true; // Still animate walking/dashing

            // dt-based dash timer (respects timeScale / slow motion)
            this.dashElapsed = (this.dashElapsed || 0) + dt;

            // Volt Drive: Dash thru enemies
            if (this.voltDriveTimer > 0) {
                this.game.enemies.forEach(e => {
                    if (this.checkCollision(this, e)) {
                        const hitKey = `volt_dash_${e.id}`;
                        this.voltHitList = this.voltHitList || new Set();
                        if (!this.voltHitList.has(hitKey)) {
                            const dmg = this.voltDriveParams.dashDamage || 20;
                            const isCrit = Math.random() < (this.voltDriveParams.critChance || 0);
                            const finalDmg = isCrit ? dmg * (this.voltDriveParams.critMultiplier || 2.0) : dmg;
                            e.takeDamage(finalDmg, '#ffff00', 0, isCrit);
                            this.voltHitList.add(hitKey);
                            this.game.spawnParticles(e.x + e.width / 2, e.y + e.height / 2, 5, '#ffff00');
                        }
                    }
                });
            }

            if (this.dashElapsed >= this.dashDuration) {
                this.isDashing = false;
                this.dashVx = 0;
                this.dashVy = 0;
                this.dashElapsed = 0;
                if (this.voltHitList) this.voltHitList.clear();
            }
        } else if (this.isCasting) {
            // Block movement input
            moving = false;
        } else {
            const speed = this.actualSpeed;
            let moveX = 0;
            let moveY = 0;

            if (this.game.input.isDown('ArrowUp') || this.game.input.isDown('KeyW')) moveY -= 1;
            if (this.game.input.isDown('ArrowDown') || this.game.input.isDown('KeyS')) moveY += 1;
            if (this.game.input.isDown('ArrowLeft') || this.game.input.isDown('KeyA')) moveX -= 1;
            if (this.game.input.isDown('ArrowRight') || this.game.input.isDown('KeyD')) moveX += 1;

            if (moveX !== 0 || moveY !== 0) {
                moving = true;
                // Normalize for diagonal movement
                const dist = Math.sqrt(moveX * moveX + moveY * moveY);
                this.vx = (moveX / dist) * speed;
                this.vy = (moveY / dist) * speed;

                // Determine 8 directions for facing
                if (moveX > 0 && moveY === 0) this.facing = 'right';
                else if (moveX < 0 && moveY === 0) this.facing = 'left';
                else if (moveX === 0 && moveY > 0) this.facing = 'down';
                else if (moveX === 0 && moveY < 0) this.facing = 'up';
                else if (moveX > 0 && moveY > 0) this.facing = 'down-right';
                else if (moveX > 0 && moveY < 0) this.facing = 'up-right';
                else if (moveX < 0 && moveY > 0) this.facing = 'down-left';
                else if (moveX < 0 && moveY < 0) this.facing = 'up-left';
            }
        }

        // Animation Logic
        if (moving) {
            this.frameTimer += dt;
            if (this.frameTimer > this.frameInterval) {
                this.frameX++;
                if (this.frameX >= this.maxFrames) this.frameX = 0;
                this.frameTimer = 0;
            }
        } else {
            this.frameX = 0; // Reset to standing frame
            this.frameTimer = 0;
        }

        // Map facing to sprite row (4 directions for sprite fallback)
        // JSON Order: 0-3 Down, 4-7 Left, 8-11 Right, 12-15 Up
        if (this.facing.includes('down')) this.frameY = 0;
        else if (this.facing.includes('up')) this.frameY = 3;
        else if (this.facing.includes('left')) this.frameY = 1;
        else if (this.facing.includes('right')) this.frameY = 2;

        // Decrease Dash Cooldown
        if (this.dashTimer > 0) {
            this.dashTimer -= dt;
        }

        // Aether Rush Logic
        if (this.isAetherRush) {
            this.aetherRushTimer -= dt;
            // Visual decay of gauge for effect
            this.aetherGauge = (this.aetherRushTimer / this.aetherRushDuration) * this.maxAetherGauge;

            if (this.aetherRushTimer <= 0) {
                this.endAetherRush();
            }

            // Passive particles during rush
            if (Math.random() < 0.3) {
                this.game.spawnParticles(
                    this.x + this.width / 2 + (Math.random() - 0.5) * 20,
                    this.y + this.height / 2 + (Math.random() - 0.5) * 20,
                    1, '#00ffff'
                );
            }
        }

        // Volt Drive Logic
        if (this.voltDriveTimer > 0) {
            this.voltDriveTimer -= dt;
            if (this.voltDriveTimer <= 0) {
                this.voltDriveTimer = 0;
                this.voltDriveParams = null;
            }

            // Passive particles
            if (Math.random() < 0.4) {
                this.game.spawnParticles(
                    this.x + this.width / 2 + (Math.random() - 0.5) * 25,
                    this.y + this.height / 2 + (Math.random() - 0.5) * 25,
                    1, '#ffff00',
                    (Math.random() - 0.5) * 50, -50,
                    { shape: 'circle', shrink: true }
                );
            }
        }

        // Ghost Afterimage Effect (Combined for Aether Rush AND Volt Drive)
        if (this.isAetherRush || this.voltDriveTimer > 0) {
            this.ghostTimer = (this.ghostTimer || 0) + dt;
            const ghostInterval = (this.voltDriveTimer > 0) ? 0.04 : 0.05;
            if (this.ghostTimer > ghostInterval) {
                this.ghostTimer = 0;

                // Calculate current frame data exactly like render()
                if (this.spriteData && this.spriteData.frames) {
                    const frameIndex = this.frameY * 4 + this.frameX;
                    if (this.spriteData.frames[frameIndex]) {
                        const frameData = this.spriteData.frames[frameIndex].frame;
                        const ratio = frameData.w / frameData.h;
                        const drawWidth = this.width * 1.05;
                        const drawHeight = drawWidth / ratio;
                        const drawX = this.x + (this.width - drawWidth) / 2;
                        const drawY = this.y + this.height - drawHeight;

                        const isVolt = this.voltDriveTimer > 0;

                        this.game.animations.push({
                            type: 'ghost',
                            x: drawX, // Use calculated draw position
                            y: drawY,
                            width: drawWidth,
                            height: drawHeight,
                            image: this.image,
                            sx: frameData.x,
                            sy: frameData.y,
                            sw: frameData.w,
                            sh: frameData.h,
                            life: 0.3,
                            maxLife: 0.3,
                            isVolt: isVolt,
                            update: function (dt) { this.life -= dt; },
                            draw: function (ctx) {
                                ctx.save();
                                ctx.globalAlpha = (this.life / this.maxLife) * 0.6;
                                if (this.isVolt) {
                                    ctx.filter = 'brightness(1.5) sepia(100%) saturate(1000%) hue-rotate(-20deg)'; // Golden/Yellow
                                } else {
                                    ctx.filter = 'brightness(2) grayscale(100%)';
                                }
                                ctx.drawImage(
                                    this.image,
                                    this.sx, this.sy, this.sw, this.sh,
                                    Math.floor(this.x), Math.floor(this.y), this.width, this.height
                                );
                                ctx.restore();
                            }
                        });
                    }
                }
            }
        }

        super.update(dt);

        // Update cooldowns for equipped skills
        for (let key in this.equippedSkills) {
            if (this.equippedSkills[key]) {
                this.equippedSkills[key].update(dt);
            }
        }

        // Input handling for skills
        // We need to map keys to slots to check for charge
        const inputMap = [
            { key: 'Space', slot: SkillType.NORMAL },
            { key: 'KeyQ', slot: 'primary1' },
            { key: 'KeyE', slot: 'primary2' },
            { key: 'KeyC', slot: SkillType.SECONDARY },
            { key: 'KeyX', slot: SkillType.ULTIMATE }
        ];

        let chargeInputDetected = false;

        for (const map of inputMap) {
            const skill = this.equippedSkills[map.slot];
            if (skill) {
                // If this is the currently charging skill
                if (this.chargingSkillSlot === map.slot) {
                    chargeInputDetected = true;
                    if (this.game.input.isDown(map.key)) {
                        // Continue Charging
                        this.chargeTimer += dt;
                        if (this.chargeTimer > this.maxChargeTime) {
                            this.chargeTimer = this.maxChargeTime; // Cap it
                            // Optional: Auto-release or visual cue?
                        }
                    } else {
                        // Released! Fire!
                        this.finishChargeAndFire();
                    }
                }
                // Start Charging?
                else if (this.game.input.isDown(map.key) && !this.isCharging && !this.isDashing && !this.isCasting) {
                    // Check if skill is chargeable
                    // We need to access the underlying data or params. 
                    // The Skill object doesn't have params directly exposed easily unless we attached them.
                    // But createSkill attached 'effect' which is a closure.
                    // Wait, we didn't attach params to the Skill instance itself in createSkill, only closed over them.
                    // IMPORTANT: We need to check if 'chargeable' is true. 
                    // Since we can't easily see internal params, we should probably add a flag to the Skill instance in createSkill.
                    // Let's assume we will add `skill.chargeable` and `skill.chargeTime` properties in `createSkill` or `skills_db`.

                    // For now, let's assume valid property exists or we check DB?
                    if (skill.chargeable) {
                        this.startCharge(map.slot, skill);
                        chargeInputDetected = true;
                    } else if (this.game.input.isDown(map.key)) { // Use isDown for continuous fire (auto-fire on cooldown)
                        // Prevent Normal Attack while interacting
                        if (map.slot === SkillType.NORMAL && this.game.isInteracting) {
                            continue;
                        }
                        this.useSkill(map.slot);
                    }
                }
            }
        }

        // If we were charging but the input is gone (e.g. key release missed due to frame drop or focus loss?)
        // The above loop handles release for the specific key.
        // But what if multiple keys? logic seems fine.

        // Dash (Shift/RightClick) - Cancels Charge
        if (this.game.input.isDown('ShiftLeft') || this.game.input.isDown('ShiftRight') || this.game.input.isPressed('ClickRight')) {
            if (this.isCharging) {
                this.cancelCharge();
            }
            this.performDash();
        }
    }

    startCharge(slot, skill) {
        this.isCharging = true;
        this.chargingSkillSlot = slot;
        this.chargeTimer = 0;
        this.maxChargeTime = skill.chargeTime || 1.0;
        this.isCasting = true; // Block movement
        console.log(`Started charging ${skill.name}`);
    }

    cancelCharge() {
        this.isCharging = false;
        this.chargingSkillSlot = null;
        this.chargeTimer = 0;
        this.isCasting = false;
        console.log("Charge Cancelled");
    }

    finishChargeAndFire() {
        const slot = this.chargingSkillSlot;
        const skill = this.equippedSkills[slot];
        if (skill) {
            const ratio = Math.min(1.0, this.chargeTimer / this.maxChargeTime);
            console.log(`Firing ${skill.name} with ratio ${ratio}`);

            // Prepare params
            const extraParams = { chargeRatio: ratio };
            let shouldResetAether = false;

            // Check if Ultimate Reset condition met
            if (skill.type === SkillType.ULTIMATE && this.isAetherRush) {
                extraParams.aetherCharge = 0;
                shouldResetAether = true;
            }

            // Pass the ratio to activate
            skill.activate(this, this.game, extraParams);

            // Reset Aether Rush AFTER activation so behaviors see the flag
            if (shouldResetAether) {
                spawnAetherExplosion(this.game, this.x + this.width / 2, this.y + this.height / 2); // Trigger Visual
                this.game.activateSlowMotion(1.0, 0.0);
                this.endAetherRush();
            }
        }

        this.cancelCharge();
    }

    useSkill(slot) {
        const skill = this.equippedSkills[slot];
        if (skill) {
            const extraParams = {};
            let shouldResetAether = false;

            // Check if Ultimate Reset condition met
            if (skill.type === SkillType.ULTIMATE && this.isAetherRush) {
                extraParams.aetherCharge = 0;
                shouldResetAether = true;
            }

            skill.activate(this, this.game, extraParams);

            // Reset Aether Rush AFTER activation so behaviors see the flag
            if (shouldResetAether) {
                spawnAetherExplosion(this.game, this.x + this.width / 2, this.y + this.height / 2); // Trigger Visual
                this.game.activateSlowMotion(1.0, 0.0);
                this.endAetherRush();
            }
        }
    }

    // Helper to get hit box based on facing direction
    getHitBox(range, width, height) {
        let hitX = this.x;
        let hitY = this.y;
        let hitW = this.width;
        let hitH = this.height;

        if (this.facing === 'left') { hitX -= range; hitW = range; if (width) hitW = width; hitX = this.x - hitW; }
        else if (this.facing === 'right') { hitX += this.width; hitW = range; if (width) hitW = width; }
        else if (this.facing === 'up') { hitY -= range; hitH = range; if (height) hitH = height; hitY = this.y - hitH; }
        else if (this.facing === 'down') { hitY += this.height; hitH = range; if (height) hitH = height; }
        else if (this.facing === 'up-left') { hitX -= range * 0.7; hitY -= range * 0.7; hitW = range; hitH = range; }
        else if (this.facing === 'up-right') { hitX += this.width - range * 0.3; hitY -= range * 0.7; hitW = range; hitH = range; }
        else if (this.facing === 'down-left') { hitX -= range * 0.7; hitY += this.height - range * 0.3; hitW = range; hitH = range; }
        else if (this.facing === 'down-right') { hitX += this.width - range * 0.3; hitY += this.height - range * 0.3; hitW = range; hitH = range; }

        // Center alignment for perpendicular axis
        if (this.facing === 'left' || this.facing === 'right') {
            if (height) {
                hitY = this.y + (this.height - height) / 2;
                hitH = height;
            }
        } else {
            if (width) {
                hitX = this.x + (this.width - width) / 2;
                hitW = width;
            }
        }

        return { x: hitX, y: hitY, w: hitW, h: hitH };
    }

    draw(ctx) {
        if (this.image.complete && this.image.naturalWidth !== 0 && this.spriteData) {
            // Calculate frame index
            const frameIndex = this.frameY * 4 + this.frameX;

            // Safety check
            if (this.spriteData.frames && this.spriteData.frames[frameIndex]) {
                const frameData = this.spriteData.frames[frameIndex].frame;

                // Calculate Aspect Ratio
                const ratio = frameData.w / frameData.h;

                // Determine drawing size based on collision width
                // Scaled by 0.7 as requested (1.5 * 0.7 = 1.05)
                const drawWidth = this.width * 1.05;
                const drawHeight = drawWidth / ratio;

                // Anchor to Bottom Center of collision box
                const drawX = (this.width - drawWidth) / 2;
                const drawY = this.height - drawHeight;

                ctx.save();
                ctx.globalAlpha *= this.alpha;
                ctx.translate(Math.floor(this.x + this.width / 2), Math.floor(this.y + this.height));
                ctx.scale(this.scale, this.scale);

                ctx.drawImage(
                    this.image,
                    frameData.x, frameData.y, frameData.w, frameData.h, // Source from JSON
                    Math.floor(drawX - this.width / 2), Math.floor(drawY - this.height), Math.floor(drawWidth), Math.floor(drawHeight) // Destination
                );
                ctx.restore();
            } else {
                console.warn('Missing frame data for index:', frameIndex);
                super.draw(ctx); // Fallback
            }
        } else {
            // Fallback (or loading state)
            if (Math.random() < 0.01) console.log('Player Draw Fallback - ImgComplete:', this.image.complete, 'HasSpriteData:', !!this.spriteData);
            super.draw(ctx);
        }

        // Draw Charge Gauge
        if (this.isCharging) {
            const barW = 40;
            const barH = 6;
            const barX = this.x + (this.width - barW) / 2;
            const barY = this.y - 15;

            // BG
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(barX, barY, barW, barH);

            // Fill
            const ratio = Math.min(1.0, this.chargeTimer / this.maxChargeTime);
            if (ratio >= 1.0) ctx.fillStyle = '#ffcc00'; // Full charge gold
            else ctx.fillStyle = '#00ccff'; // Charging blue

            ctx.fillRect(barX + 1, barY + 1, (barW - 2) * ratio, barH - 2);
        }

        // Draw Direction Indicator (Triangle at feet)
        {
            const facingAngles = {
                'right': 0,
                'down-right': Math.PI / 4,
                'down': Math.PI / 2,
                'down-left': 3 * Math.PI / 4,
                'left': Math.PI,
                'up-left': -3 * Math.PI / 4,
                'up': -Math.PI / 2,
                'up-right': -Math.PI / 4,
            };

            const angle = facingAngles[this.facing] ?? 0;
            const cx = this.x + this.width / 2;
            const cy = this.y + this.height + 6; // Slightly below feet
            const dist = 10; // Distance from feet center to tip
            const size = 5;  // Half-width of triangle base

            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(angle);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
            ctx.beginPath();
            ctx.moveTo(dist + size, 0);      // Tip
            ctx.lineTo(dist - size, -size);  // Base top
            ctx.lineTo(dist - size, size);   // Base bottom
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
    }

    performDash() {
        if (this.dashTimer > 0 || this.isDashing || this.isCasting) return;

        this.isDashing = true;
        this.dashTimer = this.dashCooldown;
        this.invulnerable = this.dashDuration + 0.1; // Slight invulnerability buffer

        // Dash Direction
        let dashMoveX = 0;
        let dashMoveY = 0;
        if (this.facing === 'left') dashMoveX = -1;
        else if (this.facing === 'right') dashMoveX = 1;
        else if (this.facing === 'up') dashMoveY = -1;
        else if (this.facing === 'down') dashMoveY = 1;
        else if (this.facing === 'up-left') { dashMoveX = -1; dashMoveY = -1; }
        else if (this.facing === 'up-right') { dashMoveX = 1; dashMoveY = -1; }
        else if (this.facing === 'down-left') { dashMoveX = -1; dashMoveY = 1; }
        else if (this.facing === 'down-right') { dashMoveX = 1; dashMoveY = 1; }

        const dist = Math.sqrt(dashMoveX * dashMoveX + dashMoveY * dashMoveY);
        this.dashVx = (dashMoveX / dist) * this.dashSpeed;
        this.dashVy = (dashMoveY / dist) * this.dashSpeed;

        console.log("Dash!", this.dashVx, this.dashVy);

        // Visual Effect (Ghost)
        const ghostInterval = 0.03; // Spawn ghost every 0.03s
        let timer = 0;

        // Add a temporary spawner animation to the game to create trails
        this.game.animations.push({
            type: 'spawner',
            life: this.dashDuration,
            update: (dt) => {
                timer += dt;
                if (timer >= ghostInterval) {
                    timer = 0;
                    // Create Ghost
                    // Calculate correct ghost visual dims
                    let ghostX = this.x;
                    let ghostY = this.y;
                    let ghostW = this.width;
                    let ghostH = this.height;

                    if (this.spriteData) {
                        const frameIndex = this.frameY * 4 + this.frameX;
                        if (this.spriteData.frames && this.spriteData.frames[frameIndex]) {
                            const frameData = this.spriteData.frames[frameIndex].frame;
                            const ratio = frameData.w / frameData.h;
                            ghostW = this.width * 1.05;
                            ghostH = ghostW / ratio;
                            ghostX = this.x + (this.width - ghostW) / 2;
                            ghostY = this.y + this.height - ghostH;
                        }
                    }

                    this.game.animations.push({
                        type: 'ghost',
                        x: ghostX, y: ghostY,
                        w: ghostW, h: ghostH,
                        life: 0.3, maxLife: 0.3,
                        color: 'rgba(100, 200, 255, 0.4)',
                        image: this.image,
                        frameX: this.frameX,
                        frameY: this.frameY,
                        spriteData: this.spriteData
                    });
                }
            }
        });

        // End Dash: use dt-based timer instead of setTimeout so it respects timeScale
        this.dashElapsed = 0;
    }

    addAether(amount) {
        if (this.isAetherRush) return; // Don't gain while active
        this.aetherGauge += amount * this.aetherMultiplier;
        if (this.aetherGauge >= this.maxAetherGauge) {
            this.aetherGauge = this.maxAetherGauge;
            this.triggerAetherRush();
        }
    }

    triggerAetherRush() {
        if (this.isAetherRush) return;
        this.isAetherRush = true;
        this.aetherRushTimer = this.aetherRushDuration;
        console.log("AETHER RUSH ACTIVATED!");

        // Reset Ultimate Cooldown
        if (this.equippedSkills[SkillType.ULTIMATE]) {
            const ult = this.equippedSkills[SkillType.ULTIMATE];
            ult.currentCooldown = 0;
            ult.stacks = ult.maxStacks;
            console.log("Ultimate Cooldown Reset!");
        }

        // Vfx (Simple flash or particle boost handled in update/draw)
        this.game.spawnParticles(this.x + this.width / 2, this.y + this.height / 2, 20, '#00ffff'); // Cyan burst
    }

    endAetherRush() {
        this.isAetherRush = false;
        this.aetherGauge = 0;
        this.aetherRushTimer = 0;
        console.log("Aether Rush Ended");
    }
}
