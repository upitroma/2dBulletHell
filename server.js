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

            exterpolate(p,deltaTime)
            
            //keep moving player to reportedPosition when possible
            catchUpToReportedPosition(p,deltaTime)

        }
    })
    if(timeSinceLastNetworkUpdate>(1/networkUpdateSpeed)){
        playerPackets=[]
        playerLookup.forEach(function(p){
            if(p.isActive){
                playerPackets.push({
                    x:p.serverPosition.x,
                    y:p.serverPosition.y,
                    inputs: p.inputs,
                    id: p.socket.id
                })
            }
        })
        playerLookup.forEach(function(p){
            if(p.isActive){
                p.socket.emit("testPositionUpdator",playerPackets)
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
    1000/gameClockSpeed//hz to s
)

//TODO: hard code these once figured out
var DEV_exterpolateMul=.3
var DEV_interpolateMul=.7

function exterpolate(p,deltaTime){
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
    p.serverPosition.x+=deltaX*DEV_exterpolateMul
    p.serverPosition.y+=deltaY*DEV_exterpolateMul


    //TODO: snap player to server position if too far away
    if( ((p.reportedPosition.x-p.serverPosition.x)*(p.reportedPosition.x-p.serverPosition.x))+
        ((p.reportedPosition.y-p.serverPosition.y)*(p.reportedPosition.y-p.serverPosition.y))
        >100*100)//threshold^2
        {
            //console.log("too far away. server should snap player to serverPosition")
        }
}

function catchUpToReportedPosition(p,deltaTime){
    targetDeltaX=p.reportedPosition.x-p.serverPosition.x
    targetDeltaY=p.reportedPosition.y-p.serverPosition.y
    maxDeltaPosition=playerSpeedNormal*deltaTime

    if(targetDeltaX<0){//left
        if(Math.abs(targetDeltaX)>maxDeltaPosition){
            targetDeltaX=-maxDeltaPosition
        }
        p.serverPosition.x+=targetDeltaX*DEV_interpolateMul
    }
    if(targetDeltaX>0){//right
        if(Math.abs(targetDeltaX)>maxDeltaPosition){
            targetDeltaX=+maxDeltaPosition
        }
        p.serverPosition.x+=targetDeltaX*DEV_interpolateMul
    }
    if(targetDeltaY>0){//up
        if(Math.abs(targetDeltaY)>maxDeltaPosition){
            targetDeltaY=+maxDeltaPosition
        }
        p.serverPosition.y+=targetDeltaY*DEV_interpolateMul
    }
    if(targetDeltaY<0){//down
        if(Math.abs(targetDeltaY)>maxDeltaPosition){
            targetDeltaY=-maxDeltaPosition
        }
        p.serverPosition.y+=targetDeltaY*DEV_interpolateMul
    }

}

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

