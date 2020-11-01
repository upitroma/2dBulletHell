var express = require("express")
var socket = require("socket.io")

const gameClockSpeed=60// hz

const networkUpdateSpeed=30// hz

const playerSpeedNormal=300// px/s

const snapDist=50//global snap distance px


/* 
TODO for player movement
client authoritative, trust but verify
client reports position and inputs,
client reports own collision and hits.

server checks the position
    is player >110% faster than they should?
    is player in a wall?
    is player colliding with bullet?

    if player does not report their position in time, use extrapolation
    no server interpolation, let the clients do that themselves

    if player is out of bounds, move player to last verified position
        send new position to player and snap them to last verified position.

    individual bullets should be synced for now, but only temporary since that is a lot of bandwidth.

*/


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
        this.sentUpdateSinceLastFrame=false
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
        if(p.isActive){//i don't think i need this since playerLookup should be spliced

            p.serverPosition=p.reportedPosition//FULL client authoraty

            if(p.sentUpdateSinceLastFrame){
                //validate position
            }
            else{
                //extrapolate then validate position
            }

            
            p.sentUpdateSinceLastFrame=false//reset for next frame

            if(new Date().getTime() - p.lastUpdateTimestamp > 3000){
                p.isActive=false
                console.log(p.socket.id+" was kicked")
                io.sockets.emit("serverPlayerDisconnect",p.socket.id)
            }
        }
    });

    
}

//send data out
function networkUpdate(){
    playerLookup.forEach(function(p){
        playerPackets=[]
        if(p.isActive){

            //TODO: only send data for players in the same room
            playerLookup.forEach(function(o){
                if(o.isActive){
                    if(o!=p){//player allready knows where they are
                        playerPackets.push({
                            x:o.serverPosition.x,
                            y:o.serverPosition.y,
                            id: o.socket.id
                        })
                    }
                }
            });
            p.socket.emit("testPositionUpdator",playerPackets)
        }
    });

    
}

//tick
//https://www.reddit.com/r/gamedev/comments/16wekk/delta_time_based_movement_did_i_get_this_right/
var lastFrameTimeStamp=0
setInterval(function(){
    dTime=(new Date().getTime() - lastFrameTimeStamp)/1000

    //game update
    update(dTime)

    //network update
    timeSinceLastNetworkUpdate+=dTime
    if(timeSinceLastNetworkUpdate>(1/networkUpdateSpeed)){
        networkUpdate()
        timeSinceLastNetworkUpdate=0
    }


    lastFrameTimeStamp=new Date().getTime()
    },
    1000/gameClockSpeed//hz to s
)

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


    /*
    //TODO: snap player to server position if too far away
    if( ((p.reportedPosition.x-p.serverPosition.x)*(p.reportedPosition.x-p.serverPosition.x))+
        ((p.reportedPosition.y-p.serverPosition.y)*(p.reportedPosition.y-p.serverPosition.y))
        >snapDist*snapDist)//threshold^2
        {
            console.log("too far away. server should snap player to serverPosition")
        }
        */
}

//useful source
//https://gist.github.com/alexpchin/3f257d0bb813e2c8c476

io.on("connection",function(socket){
    socket.id=clientId++
    playerLookup[socket.id]=new Player(socket)
    playerLookup[socket.id].socket.emit("serverPrivate","connected on socket: "+socket.id)
    console.log("client connected on socket: ",socket.id +" Current active sockets: "+getTotalActiveSockets())


    socket.on("playerData",function(data){
        //record data
        playerLookup[socket.id].reportedPosition.x=data.x
        playerLookup[socket.id].reportedPosition.y=data.y
        playerLookup[socket.id].inputs.up=data.up
        playerLookup[socket.id].inputs.down=data.down
        playerLookup[socket.id].inputs.left=data.left
        playerLookup[socket.id].inputs.right=data.right
        playerLookup[socket.id].lastUpdateTimestamp=new Date().getTime()
        playerLookup[socket.id].sentUpdateSinceLastFrame=true
        playerLookup[socket.id].updatesMissed=0
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
    playerLookup.forEach(function(p){
        if(p.isActive){
            total++
        }
    });
    return total
}

