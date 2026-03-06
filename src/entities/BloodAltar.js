import { Entity, getCachedImage } from '../utils.js';

export class BloodAltar extends Entity {
    constructor(game, x, y) {
        // Large statue-like presence (120x120)
        super(game, x - 60, y - 60, 120, 120, '#ff0000', 1);
        this.used = false;
        this.image = getCachedImage('assets/entities/blood_altar.png');
        this.showPrompt = false;
    }

    update(dt) {
        // Static entity but could have particles later
        if (Math.random() < 0.1 * (dt / 0.016)) {
            // Spawn some red particles around the altar
            this.game.animations.push({
                type: 'particle',
                x: this.x + Math.random() * this.width,
                y: this.y + Math.random() * this.height,
                w: 4, h: 4,
                life: 0.5 + Math.random() * 0.5,
                maxLife: 1.0,
                color: '#ff0000',
                vx: (Math.random() - 0.5) * 50,
                vy: -Math.random() * 100 // Rise up
            });
        }
    }

    draw(ctx) {
        if (this.image.complete && this.image.naturalWidth !== 0) {
            ctx.save();
            if (this.used) ctx.filter = 'grayscale(100%) brightness(0.5)';
            ctx.drawImage(this.image, Math.floor(this.x), Math.floor(this.y), this.width, this.height);
            ctx.restore();
        } else {
            // Placeholder: Ominous red pillar
            ctx.fillStyle = this.used ? '#330000' : '#880000';
            ctx.fillRect(Math.floor(this.x), Math.floor(this.y), this.width, this.height);
            ctx.strokeStyle = '#ff0000';
            ctx.lineWidth = 4;
            ctx.strokeRect(Math.floor(this.x), Math.floor(this.y), this.width, this.height);

            // Glowing rune symbol (X)
            ctx.beginPath();
            ctx.moveTo(this.x + 20, this.y + 20);
            ctx.lineTo(this.x + this.width - 20, this.y + this.height - 20);
            ctx.moveTo(this.x + this.width - 20, this.y + 20);
            ctx.lineTo(this.x + 20, this.y + this.height - 20);
            ctx.stroke();
        }

        if (this.showPrompt && !this.used) {
            ctx.save();
            ctx.shadowColor = 'black';
            ctx.shadowBlur = 4;
            ctx.fillStyle = '#ff4444';
            ctx.font = 'bold 18px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('[SPACE] 調べる', this.x + this.width / 2, this.y - 15);
            ctx.restore();
        }
    }

    use() {
        if (this.used) return;
        if (this.game.gameState !== 'PLAYING') return;

        // Show dialogue explaining the presence
        import('../ui.js').then(m => {
            this.game.dialogueText = "不気味な祭壇がある";
            m.drawDialogue(this.game, this.game.dialogueText);
            this.game.gameState = 'DIALOGUE';
            this.game.activeAltar = this;

            // Immediately show choices too for a smoother flow? 
            // Or wait for another space? The user said "会話ボックスの方に...表示させて...選択肢を出す"
            // If I show it immediately it's better.
            this.presentChoice();
        });
    }

    presentChoice() {
        import('../ui.js').then(m => {
            const options = [
                { id: 'sacrifice_confirm', name: '血をささげる' },
                { id: 'sacrifice_cancel', name: '離れる' }
            ];
            m.showChoices(options, (opt) => {
                if (opt.id === 'sacrifice_confirm') {
                    this.performSacrifice();
                } else {
                    this.game.gameState = 'PLAYING';
                    m.hideDialogue();
                }
            });
        });
    }

    performSacrifice() {
        // Sacrifice HP
        const cost = Math.ceil(this.game.player.hp * 0.3);
        this.game.player.takeDamage(cost, '#ff0000', 0, true);

        this.used = true;

        // VFX
        this.game.spawnParticles(this.x + this.width / 2, this.y + this.height / 2, 40, '#ff0000');
        if (this.game.camera) this.game.camera.shake(0.5, 8);

        // Apply random blood blessing
        this.grantBlessing();
    }

    grantBlessing() {
        const blessings = [
            { id: 'blood_might', name: '血の剛力', desc: 'ダメージ +50%', buff: { damageMult: 1.5 } },
            { id: 'blood_haste', name: '深紅の疾風', desc: '移動速度 +40%', buff: { speedMult: 1.4 } },
            { id: 'blood_vampirism', name: '吸血の呪い', desc: '攻撃時に10%の確率でHP1回復', buff: { vampRate: 0.1 } },
            { id: 'blood_resonance', name: '血の共鳴', desc: 'エーテル上昇量 +100%', buff: { aetherGainMult: 2.0 } }
        ];

        const selected = blessings[Math.floor(Math.random() * blessings.length)];

        // Show selection UI (Acquisition screen with "Acquire" button)
        this.game.gameState = 'REWARD_SELECT';
        import('../ui.js').then(m => {
            m.showAcquiredBlessing(selected, () => {
                // Add to player's active blessings
                this.game.player.bloodBlessings = this.game.player.bloodBlessings || [];
                this.game.player.bloodBlessings.push(selected);

                this.game.logToScreen(`契約成立: 【${selected.name}】獲得！`);
                this.game.logToScreen(selected.desc);

                // Floating notification over player
                if (this.game.player) {
                    this.game.animations.push({
                        type: 'text',
                        text: `【${selected.name}】獲得！`,
                        x: this.game.player.x + this.game.player.width / 2,
                        y: this.game.player.y - 20,
                        vx: 0,
                        vy: -50,
                        life: 2.0,
                        maxLife: 2.0,
                        color: '#ff4444',
                        font: 'bold 24px sans-serif'
                    });
                }

                m.hideDialogue();
                this.game.gameState = 'PLAYING';
            }, 'blood');
        });
    }
}
