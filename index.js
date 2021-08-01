const bodyParser = require('body-parser');
const express = require('express');
const urlencodedParser = bodyParser.urlencoded({extended: false});
const PORT = process.env.PORT || 3000;
var app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
app.set("view engine", "hbs");

var new_id = 0;
var sessions = [];
var users = {};
const WINS_COMD = [[1,2,3],[4,5,6],[7,8,9],[1,4,7],[2,5,8],[3,6,9],[1,5,9],[3,5,7]];

function win_check(session, marker){
    var markers_positions = [];
    for (position in session.space){
        if (session.space[position] == marker){
            markers_positions.push(Number(position));
        };
    };
    for (comb in WINS_COMD){
        var i = 0;
        for (elem in WINS_COMD[comb]){
            if (markers_positions.includes(WINS_COMD[comb][elem])){
                i++;
            } else {
                break;
            };
        };
        if (i == 3){
            return true;
        };
    }
    return false;
};

function tags_check(session_tags, tags){
    for (tag in tags){
        if (!session_tags.includes(tags[tag])){
            return false;
        };
    };
    return true;
};

app.get('/', function(request, response){
    var select_sessions = [];
    var activ_tags = [];
    for (session in sessions){
        if(sessions[session] && sessions[session].usersCount < 2){
            select_sessions.push(sessions[session]);
            activ_tags.push(sessions[session].game_tags.join(" "));
        };
    };    
    response.render(__dirname + "/main.hbs", {game: select_sessions, tags: activ_tags});
});

app.post('/', urlencodedParser, function(request, response){
    if(!request.body) return response.status(400);
    if(!request.body.search) return response.redirect('/');
    var tags = request.body.search.split(" ");
    var select_sessions = [];
    var activ_tags = [];
    for (session in sessions){
        if(sessions[session] && sessions[session].usersCount < 2){
            if(tags_check(sessions[session].game_tags, tags)){
                select_sessions.push(sessions[session]);
            };
            activ_tags.push(sessions[session].game_tags.join(" "));
        };
    };
    response.render(__dirname + "/main.hbs", {game: select_sessions, tags: activ_tags});
});

app.get('/newgame', function(request, response){
    response.render(__dirname + "/newgame.hbs", {validation_error: false});
});

app.post("/newgame", urlencodedParser, function(request, response){
    if (!request.body) return response.status(400);
    var name = request.body.name;
    var tags_str = request.body.tags;
    var tags = tags_str.split(' ');
    if (name != "" && tags_str != "" && name.length <= 20 && tags_str.length <= 20){
        var session = {id: new_id, game_name: name, game_tags: tags, usersCount: 0, x_player: null, y_player: null, space: {1: null, 2: null, 3: null, 4: null, 5: null, 6: null, 7: null, 8: null, 9: null}, winer: null, move: null, moves: 0};
        new_id++;
        sessions.push(session);
        response.redirect(`/game?id=${session.id}`);
    } else {
        response.render(__dirname + "/newgame.hbs", {validation_error: true});
    };
});

app.get("/game", function(request, response){
    if (!request.query.id || !sessions[request.query.id]) return response.redirect("/");
    var id = request.query.id;
    if (sessions[id].usersCount >= 2) return response.redirect("/");
    response.render(__dirname + "/game.hbs", {game: sessions[id]});
});

io.on('connection', function(socket){   
    socket.on('startGame', function(data){
        socket.join(`${data}`);
        users[`${socket.id}`] = data;
        if (sessions[data].usersCount == 0){
            sessions[data].x_player = socket.id;
            sessions[data].move = socket.id;
        } else {
            sessions[data].y_player = socket.id;
            if (!sessions[data].move){
                sessions[data].move = socket.id;
            };
        };
        sessions[data].usersCount++;
        socket.emit('startGame', sessions[data]);
    });

    socket.on('move', function(data){
        if (socket.id == sessions[data.room].move){   
            sessions[data.room].moves++;
            if (socket.id == sessions[data.room].x_player){
                sessions[data.room].space[data.move]="X";
                sessions[data.room].move = sessions[data.room].y_player;
                var marker = "X";
            } else {
                sessions[data.room].space[data.move]="O";
                sessions[data.room].move = sessions[data.room].x_player;
                var marker = "O";
            };
            if (win_check(sessions[data.room], marker)){
                sessions[data.room].winer = socket.id;
            } else if (sessions[data.room].moves == 9){
                sessions[data.room].winer = 'draw';
            };
        } else {
            io.to(socket.id).emit('error', "It's not your move now!");
        };
        io.sockets.in(`${data.room}`).emit('moveReaction', sessions[data.room]);
        if (sessions[data.room].winer){
            if (sessions[data.room].winer == 'draw'){
                io.sockets.in(`${data.room}`).emit('gameOver', 'draw')
            } else{
                io.to(sessions[data.room].winer).emit('gameOver', 'winer')
                if (sessions[data.room].winer == sessions[data.room].x_player){
                    io.to(sessions[data.room].y_player).emit('gameOver', 'loser')
                } else {
                    io.to(sessions[data.room].x_player).emit('gameOver', 'loser')
                };
            };
        };
    });

    socket.on('disconnect', function(){
        var game_id = users[`${socket.id}`];
        if (sessions[game_id].x_player && sessions[game_id].y_player) {
            if(socket.id == sessions[game_id].x_player && !sessions[game_id].winer){
                io.to(sessions[game_id].y_player).emit('gameOver', 'winer');
                sessions[game_id].x_player = null;
            } else {
                io.to(sessions[game_id].x_player).emit('gameOver', 'winer');
                sessions[game_id].y_player = null;
            };
        } else {
            sessions[game_id] = null;
        };
    });
});

http.listen(PORT);