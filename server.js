const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static('public'));

const GRID_SIZE = 20;
const CANVAS_SIZE = 600;
const COLORS = ['#FF5733', '#33FF57', '#3357FF', '#F3FF33']; // Merah, Hijau, Biru, Kuning

let players = {};
let food = spawnFood();

function spawnFood() {
    return {
        x: Math.floor(Math.random() * (CANVAS_SIZE / GRID_SIZE)),
        y: Math.floor(Math.random() * (CANVAS_SIZE / GRID_SIZE))
    };
}

io.on('connection', (socket) => {
    // Batasi maksimal 4 pemain
    if (Object.keys(players).length < 4) {
        const playerIndex = Object.keys(players).length;
        players[socket.id] = {
            id: socket.id,
            color: COLORS[playerIndex] || '#FFFFFF',
            snake: [
                { x: 5 + playerIndex * 5, y: 5 },
                { x: 5 + playerIndex * 5, y: 6 }
            ],
            dx: 0,
            dy: -1,
            score: 0,
            isDead: false
        };
    } else {
        socket.emit('full', 'Room penuh! Maksimal 4 pemain.');
    }

    // Kirim pembaruan status langsung saat ada pemain baru
    io.emit('gameState', { players, food });

    socket.on('changeDirection', (dir) => {
        const player = players[socket.id];
        if (!player || player.isDead) return;

        if (dir === 'UP' && player.dy === 0) { player.dx = 0; player.dy = -1; }
        if (dir === 'DOWN' && player.dy === 0) { player.dx = 0; player.dy = 1; }
        if (dir === 'LEFT' && player.dx === 0) { player.dx = -1; player.dy = 0; }
        if (dir === 'RIGHT' && player.dx === 0) { player.dx = 1; player.dy = 0; }
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('gameState', { players, food });
    });
});

// Game Loop (Jalan terus setiap 100ms)
setInterval(() => {
    let activePlayers = Object.values(players).filter(p => !p.isDead);

    activePlayers.forEach(player => {
        if (player.dx === 0 && player.dy === 0) return;

        const head = { 
            x: player.snake[0].x + player.dx, 
            y: player.snake[0].y + player.dy 
        };

        // Tabrak tembok
        if (head.x < 0 || head.x >= CANVAS_SIZE / GRID_SIZE || head.y < 0 || head.y >= CANVAS_SIZE / GRID_SIZE) {
            player.isDead = true;
            return;
        }

        // Tabrak badan sendiri atau pemain lain
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

        // Makan makanan
        if (head.x === food.x && head.y === food.y) {
            player.score += 10;
            food = spawnFood();
        } else {
            player.snake.pop();
        }
    });

    io.emit('gameState', { players, food });
}, 100);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server jalan di port ${PORT}`));
