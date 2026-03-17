import { getCachedImage } from './utils.js';
import { RoomPlacer } from './map/RoomPlacer.js';
import { RoomConnector } from './map/RoomConnector.js';
import { MapPathfinder } from './map/MapPathfinder.js';
import { MapRenderer } from './map/MapRenderer.js';

export class Map {
    constructor(width, height, tileSize) {
        this.width = width;
        this.height = height;
        this.pixelWidth = width * tileSize;
        this.pixelHeight = height * tileSize;
        this.tileSize = tileSize;
        this.rooms = [];
        this.roomGrid = [];
        this.exploredTiles = []; // 2D array of booleans
        this.theme = 'default';
        this.wallImages = [
            getCachedImage(`assets/map/themes/${this.theme}/wall1.png`),
            getCachedImage(`assets/map/themes/${this.theme}/wall2.png`),
            getCachedImage(`assets/map/themes/${this.theme}/wall3.png`)
        ];
        this.bloodWallImages = [
            getCachedImage(`assets/map/themes/${this.theme}/blood1.png`),
            getCachedImage(`assets/map/themes/${this.theme}/blood2.png`)
        ];
        this.floorImage = getCachedImage(`assets/map/themes/${this.theme}/floor.png`);
        this.decorationImages = [
            getCachedImage(`assets/map/themes/${this.theme}/vines1.png`),
            getCachedImage(`assets/map/themes/${this.theme}/vines2.png`),
            getCachedImage(`assets/map/themes/${this.theme}/vines3.png`)
        ];
        this.vinesOverlayImage = getCachedImage(`assets/map/themes/${this.theme}/nives4.png`);
        this.stairsImage = getCachedImage('assets/map/portal_stairs.png');

        // Initialize modules
        this.pathfinder = new MapPathfinder(this);
        this.placer = new RoomPlacer(this);
        this.renderer = new MapRenderer(this);
        this.connector = new RoomConnector(this);
        this.hasBoss = false;
        this.bossDefeated = false;
        this.minimapDirty = true;
    }

    async generate(onStatus) {
        let attempts = 0;
        const maxAttempts = 50;
        let success = false;
        let connectivityResult = { success: false, unreachable: [] };

        const yieldNow = () => new Promise(resolve => setTimeout(resolve, 0));

        do {
            attempts++;
            if (attempts > 1) {
                console.log(`Regenerating dungeon (Attempt ${attempts})...`);
                if (onStatus) onStatus(`再生成中... (試行 ${attempts})`);
            } else {
                if (onStatus) onStatus("ダンジョン核を初期化中...");
            }
            await yieldNow();

            this.tiles = [];
            this.roomGrid = [];
            for (let y = 0; y < this.height; y++) {
                this.tiles[y] = [];
                this.roomGrid[y] = [];
                this.exploredTiles[y] = [];
                for (let x = 0; x < this.width; x++) {
                    this.tiles[y][x] = 1; // 1 = Wall
                    this.roomGrid[y][x] = -1; // -1 = No Room
                    this.exploredTiles[y][x] = false;
                }
            }
            this.rooms = [];

            // 0. Place Central Startup Room (10x10, Center of Map)
            if (onStatus) onStatus("スタート地点を構築中...");
            await yieldNow();

            const centerX = Math.floor(this.width / 2) - 5;
            const centerY = Math.floor(this.height / 2) - 5;
            const startRoom = {
                x: centerX, y: centerY, w: 10, h: 10,
                type: 'start',
                connectors: [],
                id: 0,
                shape: 'square'
            };
            this.placer.carveRoom(startRoom);
            // Add 4 connectors (Center of each side, index 3 expands to 3-4 for 2-tile width)
            startRoom.connectors.push({ x: centerX + 4, y: centerY, dir: { x: 0, y: -1 }, used: false });
            startRoom.connectors.push({ x: centerX + 4, y: centerY + 9, dir: { x: 0, y: 1 }, used: false });
            startRoom.connectors.push({ x: centerX, y: centerY + 4, dir: { x: -1, y: 0 }, used: false });
            startRoom.connectors.push({ x: centerX + 9, y: centerY + 4, dir: { x: 1, y: 0 }, used: false });
            this.rooms.push(startRoom);
            this.placeStartNeighborRooms(startRoom); // Guarantee 4-way corridors + rooms

            // 1. Critical Rooms
            if (onStatus) onStatus("重要区画を配置中...");
            await yieldNow();

            let bossPlaced = this.placer.placeRoom({ w: 20, h: 20, type: 'boss', entranceCount: 1 });
            let staircasePlaced = this.placer.placeRoom({ w: 8, h: 8, type: 'staircase', entranceCount: 1 });
            let shopPlaced = this.placer.placeRoom({ w: 10, h: 10, type: 'shop', entranceCount: 1 });

            // 2. Random Rooms
            if (onStatus) onStatus("エリアを拡張中...");
            await yieldNow();

            const targetRooms = 30;
            const attemptLimit = 400;
            const SHAPES = [
                'square', 'square', 'square',
                'island', 'island', 'island',
                'L', 'L',
                'cross',
                'U',
                'T',
            ];

            for (let i = 0; i < attemptLimit && this.rooms.length < targetRooms; i++) {
                const w = Math.floor(Math.random() * 10) + 14; // 14-23
                const h = Math.floor(Math.random() * 10) + 14; // 14-23
                const entrances = Math.floor(Math.random() * 2) + 2;
                const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];

                this.placer.placeRoom({
                    w: w, h: h,
                    type: 'normal',
                    entranceCount: entrances,
                    shape: shape
                });
                // Yield occasionally during long room placement
                if (i % 50 === 0) await yieldNow();
            }

            // 3. Special Rooms
            this.placer.placeRoom({ w: 10, h: 10, type: 'treasure', entranceCount: 1 });
            // Staircase already placed
            this.placer.placeRoom({ w: 8, h: 8, type: 'statue', entranceCount: 1 });
            this.placer.placeRoom({ w: 8, h: 8, type: 'altar', entranceCount: 1 });
            // Shop already placed in critical phase

            // 4. Connectivity
            if (onStatus) onStatus("通路を連結中...");
            await yieldNow();

            this.connector.connectRooms();

            connectivityResult = this.connector.checkConnectivity();
            if (!connectivityResult.success) {
                if (onStatus) onStatus("回路を修正中...");
                await yieldNow();
                this.connector.forceConnectivity(connectivityResult.unreachable);
                connectivityResult = this.connector.checkConnectivity();
            }

            if (connectivityResult.success && staircasePlaced && shopPlaced) success = true;

            if (attempts >= maxAttempts && !success) {
                console.error("Dungeon generation failed to ensure connectivity or staircase placement.");
            }
        } while (!success && attempts < maxAttempts);

        if (onStatus) onStatus("生成完了");
        await yieldNow();

        if (!success) {
            console.error("Dungeon generation failed to ensure connectivity after max attempts.");
        }
    }

    placeStartNeighborRooms(startRoom) {
        const corridorLen = 10;

        for (let c of startRoom.connectors) {
            const dx = c.dir.x;
            const dy = c.dir.y;
            const roomW = Math.floor(Math.random() * 6) + 14; // 14–19
            const roomH = Math.floor(Math.random() * 6) + 14;

            // Corridor end tile (10 steps from connector in its direction)
            const corridorEndX = c.x + dx * corridorLen;
            const corridorEndY = c.y + dy * corridorLen;
            // New room's wall tile is one step beyond the corridor end
            const wallX = corridorEndX + dx;
            const wallY = corridorEndY + dy;

            // Position the new room so its facing wall aligns with the corridor
            let roomX, roomY;
            if (dy < 0) {        // North — south wall of new room at wallY
                roomY = wallY - roomH + 1;
                roomX = c.x - Math.floor(roomW / 2);
            } else if (dy > 0) { // South — north wall of new room at wallY
                roomY = wallY;
                roomX = c.x - Math.floor(roomW / 2);
            } else if (dx < 0) { // West  — east wall of new room at wallX
                roomX = wallX - roomW + 1;
                roomY = c.y - Math.floor(roomH / 2);
            } else {             // East  — west wall of new room at wallX
                roomX = wallX;
                roomY = c.y - Math.floor(roomH / 2);
            }

            // Map bounds check
            if (roomX < 2 || roomY < 2 ||
                roomX + roomW >= this.width - 2 ||
                roomY + roomH >= this.height - 2) continue;

            // Overlap check against existing rooms (4-tile buffer)
            let canPlace = true;
            for (let other of this.rooms) {
                if (roomX < other.x + other.w + 4 && roomX + roomW + 4 > other.x &&
                    roomY < other.y + other.h + 4 && roomY + roomH + 4 > other.y) {
                    canPlace = false; break;
                }
            }
            if (!canPlace) continue;

            // Carve the room
            const newRoom = {
                x: roomX, y: roomY, w: roomW, h: roomH,
                type: 'normal', connectors: [], id: this.rooms.length, shape: 'square'
            };
            this.placer.carveRoom(newRoom);

            // Add one connector per side (all 4 directions) for these key rooms
            const cx2 = roomX + Math.floor(roomW / 2) - 1; // Center column (x)
            const cy2 = roomY + Math.floor(roomH / 2) - 1; // Center row (y)
            newRoom.connectors.push({ x: cx2, y: roomY, dir: { x: 0, y: -1 }, used: false }); // N
            newRoom.connectors.push({ x: cx2, y: roomY + roomH - 1, dir: { x: 0, y: 1 }, used: false }); // S
            newRoom.connectors.push({ x: roomX, y: cy2, dir: { x: -1, y: 0 }, used: false }); // W
            newRoom.connectors.push({ x: roomX + roomW - 1, y: cy2, dir: { x: 1, y: 0 }, used: false }); // E

            this.rooms.push(newRoom);

            // Open start room connector wall
            this.tiles[c.y][c.x] = 0;
            if (dx === 0) { if (this.isValid(c.x + 1, c.y)) this.tiles[c.y][c.x + 1] = 0; }
            else { if (this.isValid(c.x, c.y + 1)) this.tiles[c.y + 1][c.x] = 0; }

            // Carve 10 corridor tiles (direction-aware 2-wide)
            let lx = c.x, ly = c.y;
            for (let i = 0; i < corridorLen; i++) {
                lx += dx; ly += dy;
                this.tiles[ly][lx] = 0;
                if (dx === 0) { if (this.isValid(lx + 1, ly)) this.tiles[ly][lx + 1] = 0; }
                else { if (this.isValid(lx, ly + 1)) this.tiles[ly + 1][lx] = 0; }
            }

            // Open new room entrance wall
            this.tiles[wallY][wallX] = 0;
            if (dx === 0) { if (this.isValid(wallX + 1, wallY)) this.tiles[wallY][wallX + 1] = 0; }
            else { if (this.isValid(wallX, wallY + 1)) this.tiles[wallY + 1][wallX] = 0; }

            // Mark start connector as used
            c.used = true;

            // Mark the matching back-connector in the new room as used
            const backConn = newRoom.connectors.find(nc => nc.x === wallX && nc.y === wallY);
            if (backConn) {
                backConn.used = true;
            } else {
                newRoom.connectors.push({
                    x: wallX, y: wallY, dir: { x: -dx, y: -dy }, used: true
                });
            }
        }
    }

    async generateTraining() {
        this.width = 40;
        this.height = 40;
        this.tiles = [];
        this.roomGrid = [];
        for (let y = 0; y < this.height; y++) {
            this.tiles[y] = [];
            this.roomGrid[y] = [];
            this.exploredTiles[y] = [];
            for (let x = 0; x < this.width; x++) {
                this.tiles[y][x] = 1;
                this.roomGrid[y][x] = -1;
                this.exploredTiles[y][x] = false;
            }
        }
        this.rooms = [];
        const centerX = 15;
        const centerY = 15;
        const w = 10;
        const h = 10;
        const room = {
            x: centerX, y: centerY, w: w, h: h,
            type: 'training',
            id: 0,
            cleared: true,
            active: true,
            connectors: [],
            shape: 'square'
        };

        const yieldNow = () => new Promise(resolve => setTimeout(resolve, 0));
        await yieldNow();

        // Use the placer logic to ensure consistency
        this.placer.carveRoom(room);
        this.rooms.push(room);
    }

    async generateTitleBackground() {
        this.width = 30;
        this.height = 25;
        this.tiles = [];
        this.roomGrid = [];
        for (let y = 0; y < this.height; y++) {
            this.tiles[y] = [];
            this.roomGrid[y] = [];
            this.exploredTiles[y] = [];
            for (let x = 0; x < this.width; x++) {
                this.tiles[y][x] = 1;
                this.roomGrid[y][x] = -1;
                this.exploredTiles[y][x] = false;
            }
        }
        this.rooms = [];
        const room = {
            x: 5, y: 5, w: 20, h: 15,
            type: 'start',
            id: 0,
            cleared: true,
            active: true,
            connectors: [],
            shape: 'square'
        };

        const yieldNow = () => new Promise(resolve => setTimeout(resolve, 0));
        await yieldNow();

        this.placer.carveRoom(room);
        this.rooms.push(room);
    }

    async generateLobby() {
        this.width = 40;
        this.height = 40;
        this.tiles = [];
        this.roomGrid = [];
        for (let y = 0; y < this.height; y++) {
            this.tiles[y] = [];
            this.roomGrid[y] = [];
            this.exploredTiles[y] = [];
            for (let x = 0; x < this.width; x++) {
                this.tiles[y][x] = 1;
                this.roomGrid[y][x] = -1;
                this.exploredTiles[y][x] = false;
            }
        }
        this.rooms = [];

        const yieldNow = () => new Promise(resolve => setTimeout(resolve, 0));
        await yieldNow();

        // 1. Create Start Room
        const startRoom = {
            x: 5, y: 15, w: 20, h: 20,
            type: 'start',
            id: 0,
            cleared: true,
            active: true,
            connectors: [],
            shape: 'square'
        };
        this.placer.carveRoom(startRoom);
        this.rooms.push(startRoom);

        // 2. Create Portal Room
        const portalRoom = {
            x: 25, y: 15, w: 8, h: 8,
            type: 'staircase',
            id: 1,
            cleared: true,
            active: true,
            connectors: [],
            shape: 'square'
        };
        this.placer.carveRoom(portalRoom);
        this.rooms.push(portalRoom);

        // 3. Connect them with a simple corridor
        // Midpoints
        const y = 20;
        for (let x = 15; x < 25; x++) {
            this.tiles[y][x] = 0;
            if (this.isValid(x, y + 1)) this.tiles[y + 1][x] = 0; // 2-wide
        }

        // Open walls
        this.tiles[20][14] = 0;
        this.tiles[21][14] = 0;
        this.tiles[20][25] = 0;
        this.tiles[21][25] = 0;
    }

    isValid(x, y) {
        return x >= 1 && x < this.width - 1 && y >= 1 && y < this.height - 1;
    }

    heuristic(a, b) {
        return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    }

    isWall(x, y) {
        const tx = Math.floor(x / this.tileSize);
        const ty = Math.floor(y / this.tileSize);
        return this.isWallAtTile(tx, ty);
    }

    isWallAtTile(tx, ty) {
        if (!this.isValid(tx, ty)) return true;
        return this.tiles[ty][tx] === 1 || this.tiles[ty][tx] === 2;
    }

    closeRoom(room) {
        if (!room) return;
        // Scan all 4 boundary edges for open tiles and seal them.
        // This detects ALL openings regardless of how they were created
        // (connectors, forceConnectivity, forceConnectConnector, etc.).
        const rx = room.x, ry = room.y, rw = room.w, rh = room.h;
        const sealTile = (x, y) => {
            if (this.isValid(x, y) && this.tiles[y][x] === 0) this.tiles[y][x] = 2;
        };
        // Top and bottom rows
        for (let x = rx; x < rx + rw; x++) {
            sealTile(x, ry);
            sealTile(x, ry + rh - 1);
        }
        // Left and right columns (excluding corners already covered)
        for (let y = ry + 1; y < ry + rh - 1; y++) {
            sealTile(rx, y);
            sealTile(rx + rw - 1, y);
        }
    }

    openRoom(room) {
        if (!room) return;
        // Reverse of closeRoom: restore any locked tile on the boundary back to floor.
        const rx = room.x, ry = room.y, rw = room.w, rh = room.h;
        const openTile = (x, y) => {
            if (this.isValid(x, y) && this.tiles[y][x] === 2) this.tiles[y][x] = 0;
        };
        // Top and bottom rows
        for (let x = rx; x < rx + rw; x++) {
            openTile(x, ry);
            openTile(x, ry + rh - 1);
        }
        // Left and right columns (excluding corners already covered)
        for (let y = ry + 1; y < ry + rh - 1; y++) {
            openTile(rx, y);
            openTile(rx + rw - 1, y);
        }
    }

    isTileNearConnector(x, y, room) {
        for (let c of room.connectors) {
            if (Math.abs(x - c.x) <= 2 && Math.abs(y - c.y) <= 2) return true;
        }
        return false;
    }

    markExplored(tx, ty, radius = 5) {
        for (let y = ty - radius; y <= ty + radius; y++) {
            for (let x = tx - radius; x <= tx + radius; x++) {
                if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
                    // Circular reveal
                    const dx = x - tx;
                    const dy = y - ty;
                    if (dx * dx + dy * dy <= radius * radius) {
                        if (!this.exploredTiles[y][x]) {
                            this.exploredTiles[y][x] = true;
                            this.minimapDirty = true;
                        }
                    }
                }
            }
        }
    }

    draw(ctx, camera, player, debugMode = false) {
        this.renderer.draw(ctx, camera, player, debugMode);
    }
}
