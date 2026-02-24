export class InputHandler {
    constructor() {
        this.keys = {};
        this.pressed = {}; // For single frame press
        this.mouseX = 0;
        this.mouseY = 0;

        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space') e.preventDefault();
            if (!this.keys[e.code]) {
                this.pressed[e.code] = true;
            }
            this.keys[e.code] = true;
        });
        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });
        window.addEventListener('mousedown', (e) => {
            if (e.button === 0) {
                if (!this.keys['Click']) this.pressed['Click'] = true;
                this.keys['Click'] = true;
            }
        });
        window.addEventListener('mouseup', (e) => {
            if (e.button === 0) this.keys['Click'] = false;
        });
        window.addEventListener('mousemove', (e) => {
            const canvas = document.querySelector('canvas');
            if (canvas) {
                const rect = canvas.getBoundingClientRect();
                this.mouseX = e.clientX - rect.left;
                this.mouseY = e.clientY - rect.top;
            } else {
                this.mouseX = e.clientX;
                this.mouseY = e.clientY;
            }
        });
    }
    isDown(key) { return this.keys[key]; }
    isPressed(key) { return this.pressed[key]; }
    update() { this.pressed = {}; }
}

export const getCachedImage = (src) => {
    if (!window.imageCache) window.imageCache = {};
    if (window.imageCache[src]) return window.imageCache[src];
    const img = new Image();
    img.src = src;
    img.onerror = () => console.error("Failed to load image:", src);
    window.imageCache[src] = img;
    return img;
};

export const getCachedJson = async (src) => {
    if (!window.jsonCache) window.jsonCache = {};
    if (window.jsonCache[src]) return window.jsonCache[src];
    try {
        const response = await fetch(src);
        const data = await response.json();
        window.jsonCache[src] = data;
        return data;
    } catch (e) {
        console.error("Failed to load JSON:", src, e);
        return null;
    }
};

export class Camera {
    constructor(width, height, mapWidth, mapHeight) {
        this.width = width;
        this.height = height;
        this.mapWidth = mapWidth;
        this.mapHeight = mapHeight;
        this.x = 0;
        this.y = 0;
        this.shakeTimer = 0;
        this.shakeIntensity = 0;
    }

    shake(duration, intensity) {
        // Use Math.max to ensure stronger/longer shakes are not overwritten by weaker hits/effects
        this.shakeTimer = Math.max(this.shakeTimer, duration);
        this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
    }

    isVisible(x, y, w, h) {
        // Simple AABB check
        // Add minimal padding to prevent pop-in
        const padding = 50;
        return (
            x + w + padding > this.x &&
            x - padding < this.x + this.width &&
            y + h + padding > this.y &&
            y - padding < this.y + this.height
        );
    }

    follow(target, dt) {
        let targetX = target.x + target.width / 2 - this.width / 2;
        let targetY = target.y + target.height / 2 - this.height / 2;

        if (dt) {
            const factor = 5 * dt; // Smoothing factor
            this.x += (targetX - this.x) * factor;
            this.y += (targetY - this.y) * factor;
        } else {
            this.x = targetX;
            this.y = targetY;
        }

        // Apply Shake
        // Apply Shake
        if (this.shakeTimer > 0) {
            // Apply offset first to ensure even single-frame shakes are visible
            const offsetX = (Math.random() - 0.5) * this.shakeIntensity * 2;
            const offsetY = (Math.random() - 0.5) * this.shakeIntensity * 2;
            this.x += offsetX;
            this.y += offsetY;

            this.shakeTimer -= dt;
            if (this.shakeTimer <= 0) {
                this.shakeTimer = 0;
                this.shakeIntensity = 0;
            }
        }

        this.x = Math.max(0, Math.min(this.x, this.mapWidth - this.width));
        this.y = Math.max(0, Math.min(this.y, this.mapHeight - this.height));
    }
}

export class Entity {
    constructor(game, x, y, width, height, color, hp) {
        this.id = Math.random().toString(36).substr(2, 9); // Simple unique ID
        this.game = game;
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.color = color;
        this.hp = hp;
        this.maxHp = hp;
        this.speed = 0;
        this.vx = 0;
        this.vy = 0;
        this.markedForDeletion = false;
        this.invulnerable = 0;
        this.damageColor = '#fff'; // Default damage text color
    }

    update(dt) {
        if (this.invulnerable > 0) this.invulnerable -= dt;

        let nextX = this.x + this.vx * dt;
        if (!this.checkCollision(nextX, this.y)) {
            this.x = nextX;
        }

        let nextY = this.y + this.vy * dt;
        if (!this.checkCollision(this.x, nextY)) {
            this.y = nextY;
        }
    }

    checkCollision(x, y) {
        // Tile-based collision
        const isWall = this.game.map.isWall(x, y) ||
            this.game.map.isWall(x + this.width, y) ||
            this.game.map.isWall(x, y + this.height) ||
            this.game.map.isWall(x + this.width, y + this.height);

        if (isWall) return true;

        // Entity-based solid collision (Crates, etc.)
        // Block player and monsters (non-solid enemies)
        const isMovable = this === this.game.player || (!this.isSolid && this.game.enemies.includes(this));
        if (isMovable) {
            const solidEntities = [
                ...this.game.enemies,
                ...this.game.entities
            ].filter(e => e !== this && e.isSolid && !e.markedForDeletion);

            for (const other of solidEntities) {
                if (x < other.x + other.width && x + this.width > other.x &&
                    y < other.y + other.height && y + this.height > other.y) {
                    return true;
                }
            }
        }

        return false;
    }

    takeDamage(amount) {
        if (this.invulnerable > 0) return;
        this.hp -= amount;

        // Spawn Damage Text
        this.game.animations.push({
            type: 'text',
            text: amount,
            x: this.x + this.width / 2,
            y: this.y,
            vx: (Math.random() - 0.5) * 50,
            vy: -100,
            life: 0.8,
            maxLife: 0.8,
            color: this.damageColor,
            font: '20px sans-serif'
        });

        if (this.hp <= 0) {
            this.hp = 0;
            this.markedForDeletion = true;
        }
        this.invulnerable = 0.5;
    }

    draw(ctx) {
        ctx.fillStyle = this.color;
        if (this.invulnerable > 0 && Math.floor(Date.now() / 100) % 2 === 0) {
            ctx.fillStyle = 'white';
        }
        ctx.fillRect(Math.floor(this.x), Math.floor(this.y), this.width, this.height);

        if (this.hp < this.maxHp) {
            ctx.fillStyle = 'red';
            ctx.fillRect(Math.floor(this.x), Math.floor(this.y - 10), this.width, 5);
            ctx.fillStyle = 'green';
            ctx.fillRect(Math.floor(this.x), Math.floor(this.y - 10), this.width * (this.hp / this.maxHp), 5);
        }
    }
}
