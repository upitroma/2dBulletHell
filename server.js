var express = require("express")
var socket = require("socket.io")

const gameClockSpeed=30// hz

const networkUpdateSpeed=10// hz

const playerSpeedNormal=300// px/s



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

        this.lastUpdateTimestamp=new Date().getTime()

        this.serverPosition={
            x:100,
            y:100
        }
        this.reportedPosition={
            x:100,
            y:100
        }
        this.inputs={
            up: false,
            down: false,
            left: false,
            right: false,
        }
    }
}

//keep track of players
var playerLookup=[]
//socket setup
var io = socket(server)

var clientId=0



//main game loop
var timeSinceLastNetworkUpdate=0
function update(deltaTime){
    playerLookup.forEach(function(p){
        if(p.isActive){
            var deltaY = (
                p.inputs.down*playerSpeedNormal*deltaTime
                - p.inputs.up*playerSpeedNormal*deltaTime
            )
            var deltaX=(
                p.inputs.right*playerSpeedNormal*deltaTime
                - p.inputs.left*playerSpeedNormal*deltaTime
            )
            //TODO: collision
            //TODO: stop from going off screen
            p.serverPosition.x+=deltaX
            p.serverPosition.y+=deltaY

            //console.log(p)
        }
    })
    if(timeSinceLastNetworkUpdate>(1/networkUpdateSpeed)){
        playerLookup.forEach(function(p){
            if(p.isActive){
                p.socket.emit("testPositionUpdator",{
                    x: p.serverPosition.x,
                    y: p.serverPosition.y,
                })
            }
        })
        timeSinceLastNetworkUpdate=0
    }

    timeSinceLastNetworkUpdate+=deltaTime
}


//tick
//https://www.reddit.com/r/gamedev/comments/16wekk/delta_time_based_movement_did_i_get_this_right/
var lastFrameTimeStamp=0
setInterval(function(){
    update((new Date().getTime() - lastFrameTimeStamp)/1000)
    lastFrameTimeStamp=new Date().getTime()
    },
    1000/gameClockSpeed//delay between frames
)

//useful source
//https://gist.github.com/alexpchin/3f257d0bb813e2c8c476

io.on("connection",function(socket){
    socket.id=clientId++
    playerLookup[socket.id]=new Player(socket)
    playerLookup[socket.id].socket.emit("serverPrivate","connected on socket: "+socket.id)

    console.log("client connected on socket: ",socket.id +" Current active sockets: "+getTotalActiveSockets())

    //listen for data
    socket.on('disconnect', function(){
        console.info('user disconnected from socket: ' + socket.id+" Current active sockets: "+getTotalActiveSockets());
        playerLookup[socket.id].isActive=false
        io.sockets.emit("serverMessage","user disconnected on socket: "+socket.id+". Current active sockets: "+getTotalActiveSockets())
        io.sockets.emit("serverPlayerDisconnect",socket.id)
    });

    socket.on("playerData",function(data){
        //record data
        playerLookup[socket.id].reportedPosition.x=data.x
        playerLookup[socket.id].reportedPosition.y=data.y
        playerLookup[socket.id].inputs.up=data.up
        playerLookup[socket.id].inputs.down=data.down
        playerLookup[socket.id].inputs.left=data.left
        playerLookup[socket.id].inputs.right=data.right
        playerLookup[socket.id].lastUpdateTimestamp=new Date().getTime()
    })
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

