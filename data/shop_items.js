/**
 * ショップアイテムデータベース（スキルのみ版）
 *
 * skills_db.js からランダムに選んだスキルを販売する。
 * スキルの type によって価格帯を決定する：
 *   normal  → common  : 30〜80  シャード
 *   primary → rare    : 100〜200 シャード
 *   secondary → rare  : 100〜200 シャード
 *   ultimate → epic   : 250〜450 シャード
 */

export const RARITY_PRICE_RANGE = {
    common: { min: 30, max: 80 },
    rare: { min: 100, max: 200 },
    epic: { min: 250, max: 450 }
};

function typeToRarity(skillType) {
    if (skillType === 'ultimate') return 'epic';
    if (skillType === 'primary' || skillType === 'secondary') return 'rare';
    return 'common'; // normal, その他
}

export function rollPrice(rarity) {
    const range = RARITY_PRICE_RANGE[rarity] || RARITY_PRICE_RANGE.common;
    return Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
}

/** ゲームオブジェクトのanimations配列にパーティクルをスポーンするユーティリティ */
function spawnBurst(game, color, count = 15) {
    const px = game.player.x + (game.player.width || 32) / 2;
    const py = game.player.y + (game.player.height || 32) / 2;
    if (!game.animations) return;
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 40 + Math.random() * 80;
        game.animations.push({
            type: 'particle',
            x: px + (Math.random() - 0.5) * 20,
            y: py + (Math.random() - 0.5) * 20,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 60,
            life: 0.4 + Math.random() * 0.4,
            maxLife: 0.8,
            w: 4 + Math.random() * 4,
            h: 4 + Math.random() * 4,
            color,
            gravity: 180
        });
    }
}

const BURST_COLORS = {
    common: '#ccccff',
    rare: '#4488ff',
    epic: '#dd88ff'
};

/**
 * skills_db からランダムに count 個のスキルを選び、
 * ショップ在庫フォーマットに変換して返す。
 * ショップ側（ShopNPC.js）からこの関数を呼び出す。
 */
export async function generateSkillStock(count = 2) {
    const { skillsDB } = await import('./skills_db.js');
    const { createSkill } = await import('../src/skills/index.js');

    const shuffled = [...skillsDB].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count).map(skillData => {
        const rarity = typeToRarity(skillData.type);
        return {
            id: skillData.id,
            name: skillData.name,
            description: skillData.description || '',
            rarity,
            icon: skillData.icon || null,
            price: rollPrice(rarity),
            sold: false,
            _skillData: skillData, // キャッシュ
            apply(game) {
                const skill = createSkill(skillData);
                if (skill) {
                    const success = game.player.acquireSkill(skill);
                    if (success) {
                        spawnBurst(game, BURST_COLORS[rarity], rarity === 'epic' ? 40 : rarity === 'rare' ? 25 : 15);
                    }
                }
            }
        };
    });
}
