import { spawnProjectile } from '../common.js';

export const barrageBehaviors = {
    'barrage': (user, game, params) => {
        // Aether Rush Modifiers
        if (user.isAetherRush) {
            params.perWave = (params.perWave || 1) + 2; // +2 Columns
            params.width = (params.width || 10) * 2;
            params.height = (params.height || 10) * 2;
            console.log("Aether Rush Barrage!");
        }

        const waves = params.waves || 4;
        const perWave = params.perWave || 2;
        const interval = params.interval || 0.08;
        const spread = params.angleSpread || 5;
        const spacing = params.spacing || 20;
        const speed = params.speed || 550;

        user.isCasting = true;

        let waveCount = 0;
        let timer = interval; // Trigger immediately? Logic below increments first.

        // Push spawner to animations
        game.animations.push({
            type: 'spawner',
            life: waves * interval + 0.5,
            update: (dt) => {
                timer += dt;
                if (timer >= interval && waveCount < waves) {
                    timer = 0;

                    // Calc Base Velocity based on Facing
                    let baseVx = 0, baseVy = 0;
                    let nx = 0, ny = 0; // Normal vector for spacing

                    if (user.facing === 'left') { baseVx = -speed; ny = 1; }
                    else if (user.facing === 'right') { baseVx = speed; ny = 1; }
                    else if (user.facing === 'up') { baseVy = -speed; nx = 1; }
                    else if (user.facing === 'down') { baseVy = speed; nx = 1; }
                    else if (user.facing === 'up-left') { baseVx = -speed * 0.707; baseVy = -speed * 0.707; nx = 0.707; ny = -0.707; }
                    else if (user.facing === 'up-right') { baseVx = speed * 0.707; baseVy = -speed * 0.707; nx = 0.707; ny = 0.707; }
                    else if (user.facing === 'down-left') { baseVx = -speed * 0.707; baseVy = speed * 0.707; nx = 0.707; ny = -0.707; }
                    else if (user.facing === 'down-right') { baseVx = speed * 0.707; baseVy = speed * 0.707; nx = 0.707; ny = 0.707; }

                    for (let i = 0; i < perWave; i++) {
                        // Offset
                        const offsetMag = (i - (perWave - 1) / 2) * spacing;
                        const centerX = user.x + user.width / 2;
                        const centerY = user.y + user.height / 2;

                        const spawnX = centerX + (nx * offsetMag);
                        const spawnY = centerY + (ny * offsetMag);

                        // Spread Angle
                        const angleNoise = ((Math.random() - 0.5) * spread) * (Math.PI / 180);

                        // Rotate Velocity using universal angle calculation
                        const baseAngle = Math.atan2(baseVy, baseVx);
                        const finalAngle = baseAngle + angleNoise;
                        const baseSpeed = Math.sqrt(baseVx * baseVx + baseVy * baseVy);
                        let vx = Math.cos(finalAngle) * baseSpeed;
                        let vy = Math.sin(finalAngle) * baseSpeed;

                        const waveParams = { ...params };
                        if (baseVy !== 0 && baseVx === 0 && params.width && params.height) {
                            waveParams.width = params.height;
                            waveParams.height = params.width;
                        }

                        spawnProjectile(game, spawnX, spawnY, vx, vy, waveParams);
                    }
                    waveCount++;

                    if (waveCount >= waves) {
                        user.isCasting = false;
                    }
                }
            }
        });
    }
};
