const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static('public'));

const GRID_SIZE = 20;
const CANVAS_SIZE = 600;
const COLORS = ['#FF5733', '#33FF57', '#3357FF', '#F3FF33'];

let players = {};
let food = spawnFood();
let gameRunning = false;
let gameLoopInterval = null;

function spawnFood() {
    return {
        x: Math.floor(Math.random() * (CANVAS_SIZE / GRID_SIZE)),
        y: Math.floor(Math.random() * (CANVAS_SIZE / GRID_SIZE))
    };
}

function resetGame() {
    food = spawnFood();
    const playerIDs = Object.keys(players);
    playerIDs.forEach((id, index) => {
        players[id].snake = [
            { x: 5 + index * 5, y: 5 },
            { x: 5 + index * 5, y: 6 }
        ];
        players[id].dx = 0;
        players[id].dy = -1;
        players[id].score = 0;
        players[id].isDead = false;
        players[id].isReady = false; // Reset status ready
    });
}

function checkAllReadyAndStart() {
    const playerList = Object.values(players);
    // Game bisa mulai jika ada minimal 2 player dan SEMUA player sudah Ready
    if (playerList.length >= 2 && playerList.every(p => p.isReady)) {
        gameRunning = true;
        resetGame();
        io.emit('gameStarted');
        runGameLoop();
    }
}

function runGameLoop() {
    if (gameLoopInterval) clearInterval(gameLoopInterval);

    gameLoopInterval = setInterval(() => {
        if (!gameRunning) return;

        let activePlayers = Object.values(players).filter(p => !p.isDead);

        // Jika tersisa 1 atau 0 player hidup, hentikan game (Game Over)
        if (activePlayers.length <= 1 && Object.keys(players).length > 1) {
            gameRunning = false;
            clearInterval(gameLoopInterval);
            io.emit('gameOver', { players });
            return;
        }

        activePlayers.forEach(player => {
            const head = { 
                x: player.snake[0].x + player.dx, 
                y: player.snake[0].y + player.dy 
            };

            // 1. Tabrak Tembok
            if (head.x < 0 || head.x >= CANVAS_SIZE / GRID_SIZE || head.y < 0 || head.y >= CANVAS_SIZE / GRID_SIZE) {
                player.isDead = true;
                return;
            }

            // 2. Tabrak Ekor Sendiri / Ular Lain
            Object.values(players).forEach(otherPlayer => {
                otherPlayer.snake.forEach((segment, index) => {
                    if (otherPlayer.id === player.id && index === 0) return;
                    if (head.x === segment.x && head.y === segment.y) {
                        player.isDead = true;
                    }
                });
            });

            if (player.isDead) return;

            player.snake.unshift(head);

            // 3. Makan Makanan
            if (head.x === food.x && head.y === food.y) {
                player.score += 10;
                food = spawnFood();
            } else {
                player.snake.pop();
            }
        });

        io.emit('gameState', { players, food, gameRunning });
    }, 100);
}

io.on('connection', (socket) => {
    console.log(`Player terhubung: ${socket.id}`);

    if (Object.keys(players).length < 4 && !gameRunning) {
        const playerIndex = Object.keys(players).length;
        players[socket.id] = {
            id: socket.id,
            color: COLORS[playerIndex] || '#FFFFFF',
            snake: [],
            dx: 0,
            dy: -1,
            score: 0,
            isDead: false,
            isReady: false
        };
    } else {
        socket.emit('full', 'Room penuh atau game sedang berjalan!');
    }

    // Toggle Ready State
    socket.on('playerReady', () => {
        if (players[socket.id] && !gameRunning) {
            players[socket.id].isReady = !players[socket.id].isReady;
            io.emit('lobbyUpdate', { players, gameRunning });
            checkAllReadyAndStart();
        }
    });

    socket.on('changeDirection', (dir) => {
        const player = players[socket.id];
        if (!player || player.isDead || !gameRunning) return;

        if (dir === 'UP' && player.dy === 0) { player.dx = 0; player.dy = -1; }
        if (dir === 'DOWN' && player.dy === 0) { player.dx = 0; player.dy = 1; }
        if (dir === 'LEFT' && player.dx === 0) { player.dx = -1; player.dy = 0; }
        if (dir === 'RIGHT' && player.dx === 0) { player.dx = 1; player.dy = 0; }
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        if (Object.keys(players).length === 0) {
            gameRunning = false;
            if (gameLoopInterval) clearInterval(gameLoopInterval);
        }
        io.emit('lobbyUpdate', { players, gameRunning });
    });

    // Kirim status awal ke player baru
    socket.emit('lobbyUpdate', { players, gameRunning });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server berjalan di port ${PORT}`);
});