import { Entity, getCachedImage } from '../utils.js';

export class SpikeTrap extends Entity {
    constructor(game, x, y) {
        // Floor tile size is usually 40x40
        super(game, x, y, 40, 40, '#555555', 1);

        this.states = {
            IDLE: 0,
            WARNING: 1,
            ACTIVE: 2
        };
        this.state = this.states.IDLE;

        // Timers (Synchronized)
        this.timer = 2.0;
        this.idleDuration = 2.5;
        this.warningDuration = 0.8;
        this.activeDuration = 1.2;

        this.hitCooldowns = new Map(); // Store cooldown per enemy
        this.cooldownTime = 0.5;

        this.spikeImage = getCachedImage('assets/trap_spike.png');
    }

    update(dt) {
        this.timer -= dt;

        // State Transitions
        if (this.timer <= 0) {
            if (this.state === this.states.IDLE) {
                this.state = this.states.WARNING;
                this.timer = this.warningDuration;
            } else if (this.state === this.states.WARNING) {
                this.state = this.states.ACTIVE;
                this.timer = this.activeDuration;
                // Shake slightly when activating
                const dist = Math.hypot(this.game.player.x - this.x, this.game.player.y - this.y);
                if (dist < 300) this.game.camera.shake(0.1, 2);
            } else {
                this.state = this.states.IDLE;
                this.timer = this.idleDuration;
                this.hitCooldowns.clear();
            }
        }

        // Damage Logic
        if (this.state === this.states.ACTIVE) {
            // Check player
            if (this.checkCollisionWith(this.game.player)) {
                this.triggerTrap(this.game.player, true);
            }
        }

        // Decay cooldowns
        for (let [entity, cd] of this.hitCooldowns.entries()) {
            if (cd > 0) {
                this.hitCooldowns.set(entity, cd - dt);
            }
        }
    }

    checkCollisionWith(entity) {
        return (
            this.x < entity.x + entity.width &&
            this.x + this.width > entity.x &&
            this.y < entity.y + entity.height &&
            this.y + this.height > entity.y
        );
    }

    triggerTrap(entity, isPlayer = false) {
        let currentCD = this.hitCooldowns.get(entity) || 0;
        if (currentCD > 0) return;

        // Physics-based damage: Check if entity is moving fast (collision impact/knockback)
        const speed = Math.hypot(entity.vx || 0, entity.vy || 0);
        const isImpact = speed > 300; // Knockback threshold

        const baseDamage = 5;
        const multiplier = isImpact ? 2.5 : 1.0;
        const finalDamage = Math.ceil(baseDamage * multiplier);

        entity.takeDamage(finalDamage, '#ffffff');

        // Visual effect on hit
        if (isImpact) {
            this.game.spawnParticles(entity.x + entity.width / 2, entity.y + entity.height / 2, 10, '#ff0000');
            if (this.game.camera) this.game.camera.shake(0.2, 5);
        }

        this.hitCooldowns.set(entity, this.cooldownTime);
    }

    draw(ctx) {
        const x = Math.floor(this.x);
        const y = Math.floor(this.y);
        const w = this.width;
        const h = this.height;

        // Base Plate
        ctx.fillStyle = '#333';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);

        const hasImage = this.spikeImage.complete && this.spikeImage.naturalWidth !== 0;

        // Holes / Spikes
        const padding = 10;
        const cols = 2; // Use 2x2 for image based spikes to prevent crowding
        const rows = 2;
        const stepX = (w - padding * 2) / (cols - 1 || 1);
        const stepY = (h - padding * 2) / (rows - 1 || 1);

        // Pre-calculate common animation values
        let globalSpikeYOffset = 0;
        let warningAlpha = 0;

        if (this.state === this.states.WARNING) {
            globalSpikeYOffset = h * 0.85; // Mostly submerged
            warningAlpha = 0.2 + (Math.sin(Date.now() / 100) * 0.5 + 0.5) * 0.4;
        } else if (this.state === this.states.ACTIVE) {
            const thrustDuration = 0.12;
            const retractDuration = 0.3; // Time taken to retract at the end
            const elapsed = this.activeDuration - this.timer;
            const targetOffset = h * 0.45;
            const startOffset = h * 0.85;

            if (elapsed < thrustDuration) {
                // Thrust Up
                const p = elapsed / thrustDuration;
                globalSpikeYOffset = startOffset + (targetOffset - startOffset) * p;
            } else if (this.timer < retractDuration) {
                // Retract Down
                const p = 1.0 - (this.timer / retractDuration);
                globalSpikeYOffset = targetOffset + (startOffset - targetOffset) * p;
            } else {
                // Fully Extended
                globalSpikeYOffset = targetOffset;
            }
        }

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const px = x + padding + c * stepX;
                const py = y + padding + r * stepY;

                // Always draw the "hole" at the base
                ctx.fillStyle = '#111';
                ctx.beginPath();
                ctx.arc(px, py, 4, 0, Math.PI * 2);
                ctx.fill();

                if (this.state !== this.states.IDLE) {
                    if (hasImage) {
                        ctx.save();
                        // Per-spike clipping: ensure the spike doesn't draw below the hole's center line (py)
                        // This makes it look like it's emerging from the back/inside of the hole.
                        ctx.beginPath();
                        ctx.rect(px - stepX / 2, py - h, stepX, h + 2); // Clip slightly below center
                        ctx.clip();

                        const imgW = this.spikeImage.naturalWidth;
                        const imgH = this.spikeImage.naturalHeight;
                        // Scale so the spike is proportional to the trap height
                        const scale = (h * 0.8) / imgH;
                        const drawW = imgW * scale;
                        const drawH = imgH * scale;

                        ctx.translate(px, py - 4 + globalSpikeYOffset);
                        ctx.drawImage(this.spikeImage, -drawW / 2, -drawH, drawW, drawH);
                        ctx.restore();
                    } else {
                        // Procedural fallback
                        if (this.state === this.states.ACTIVE) {
                            ctx.fillStyle = '#bbb';
                            ctx.strokeStyle = '#fff';
                            ctx.lineWidth = 1;
                            ctx.beginPath();
                            ctx.moveTo(px, py - 10);
                            ctx.lineTo(px - 6, py + 5);
                            ctx.lineTo(px + 6, py + 5);
                            ctx.closePath();
                            ctx.fill();
                            ctx.stroke();
                        }
                    }
                }
            }
        }
    }
}
