var express = require("express")
var socket = require("socket.io")

var fs = require('fs');

fs.appendFile('loginCredentials.txt', 'testing\n', function (err) {
    if (err) throw err;
    console.log('Saved!');
  }); 


//app setup
var app = express();
var server = app.listen(4000,function(){
    console.log("Server is up on http://"+getIp()+":4000")
});

//static files
app.use(express.static("public"))

class Player{
    constructor(socket){
        this.socket=socket
        this.isActive=true

        this.username="anonymous"
        this.health=100
        this.position={
            x:0,
            y:0,
            a:0
        }
    }
}

//keep track of players
var playerLookup=[]
//socket setup
var io = socket(server)

var clientId=0

//useful source
//https://gist.github.com/alexpchin/3f257d0bb813e2c8c476


io.on("connection",function(socket){
    socket.id=clientId++
    playerLookup[socket.id]=new Player(socket)
    playerLookup[socket.id].socket.emit("serverPrivate",socket.id)

    console.log("client connected on socket: ",socket.id +" Current active sockets: "+getTotalActiveSockets())
    
    io.sockets.emit("serverMessage","new connection on socket: "+socket.id+". Current active sockets: "+getTotalActiveSockets())

    //listen for data

    socket.on("login attempt",function(data){


    })

    socket.on('disconnect', function(){
        console.info('user disconnected from socket: ' + socket.id+" Current active sockets: "+getTotalActiveSockets());
        playerLookup[socket.id].isActive=false
        io.sockets.emit("serverMessage","user disconnected on socket: "+socket.id+". Current active sockets: "+getTotalActiveSockets())
        io.sockets.emit("serverPlayerDisconnect",socket.id)
    });
});


function getIp(){
    var os = require('os');
    var interfaces = os.networkInterfaces();
    var addresses = [];
    for (var k in interfaces) {
        for (var k2 in interfaces[k]) {
            var address = interfaces[k][k2];
            if (address.family === 'IPv4' && !address.internal) {
                addresses.push(address.address);
            }
        }
    }
    return addresses
}

function getTotalActiveSockets(){
    var total=0
    for(var i=0;i<playerLookup.length;i++){
        if(playerLookup[i].isActive){
            total++
        }
    }
    return total
}



//security
var usedIDs=[]
function generateHostId(){
    var r = Math.floor(Math.random() * 100000)
    while (usedIDs.includes(r)){
        r = Math.floor(Math.random() * 100000)
    }
    return r
}