import { Entity, getCachedImage } from '../utils.js';

export class Statue extends Entity {
    constructor(game, x, y) {
        // Resize to 3x (120x120) and center (offset by -40, -40 relative to a 40x40 center)
        super(game, x - 60, y - 60, 120, 120, '#ffffff', 1);
        this.used = false;
        this.image = getCachedImage('assets/entities/statue_angel.png');
        this.showPrompt = false;
    }

    update(dt) {
        // Static entity
    }

    draw(ctx) {
        if (this.image.complete && this.image.naturalWidth !== 0) {
            ctx.save();
            if (this.used) ctx.filter = 'grayscale(100%) brightness(0.5)';
            ctx.drawImage(this.image, Math.floor(this.x), Math.floor(this.y), this.width, this.height);
            ctx.restore();
        } else {
            // Placeholder: Angelic winged block
            ctx.fillStyle = this.used ? '#555' : '#fff';
            ctx.fillRect(Math.floor(this.x), Math.floor(this.y), this.width, this.height);
            ctx.strokeStyle = '#000';
            ctx.strokeRect(Math.floor(this.x), Math.floor(this.y), this.width, this.height);

            // Wing shapes
            ctx.fillStyle = this.used ? '#444' : '#e0f0ff';
            ctx.beginPath();
            ctx.moveTo(this.x, this.y + 10);
            ctx.lineTo(this.x - 10, this.y - 5);
            ctx.lineTo(this.x, this.y + 20);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(this.x + this.width, this.y + 10);
            ctx.lineTo(this.x + this.width + 10, this.y - 5);
            ctx.lineTo(this.x + this.width, this.y + 20);
            ctx.fill();
        }

        if (this.showPrompt && !this.used) {
            ctx.fillStyle = 'white';
            ctx.font = '16px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('[SPACE] 祈る', this.x + this.width / 2, this.y - 10);
        }
    }

    use() {
        if (this.game.gameState === 'REWARD_SELECT' || this.game.gameState === 'DIALOGUE') return; // Prevent double trigger
        if (this.used) return;

        this.game.spawnParticles(this.x + this.width / 2, this.y + this.height / 2, 20, '#ffffff');

        // Start Dialogue
        this.game.gameState = 'DIALOGUE';
        this.game.dialogueText = "天使の加護を授けましょう";
        this.game.activeStatue = this;
        this.game.input.spacePressed = true;
    }

    presentRewards() {
        import('../ui.js').then(ui => {
            const choices = [];

            // 1. HP Up
            choices.push({ id: 'hp_up', name: '最大HPアップ', description: '最大HPが20上昇し、HPが20回復する。', rarity: 'common' });

            // 2. Full Heal
            choices.push({ id: 'full_heal', name: '全回復', description: 'HPを全回復する。', rarity: 'common' });

            // 3. Shards
            choices.push({ id: 'shards', name: 'エーテルシャード', description: 'エーテルシャードを50個獲得する。', rarity: 'common' });

            // 4. Random Skill (Generic)
            choices.push({
                id: 'random_skill_grant',
                name: 'ランダムスキル\n習得',
                description: 'ランダムなスキルを1つ習得する。',
                rarity: 'rare'
            });

            // Pick 3 random
            const options = choices.sort(() => 0.5 - Math.random()).slice(0, 3);

            // Trigger UI
            this.game.gameState = 'REWARD_SELECT';
            ui.showBlessingSelection(options, (selectedOpt) => {
                // After selecting from 3, show the final acquisition screen 
                ui.showAcquiredBlessing(selectedOpt, () => {
                    this.game.applyReward(selectedOpt);
                    ui.hideDialogue();
                    this.game.gameState = 'PLAYING';
                }, 'angel');
            }, 'angel');

            console.log("Statue Interaction: Options showed", options);

            // Screen shake for impact
            if (this.game.camera) this.game.camera.shake(0.4, 4);
        });
    }
}
