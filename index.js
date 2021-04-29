var express = require("express")
var socket = require("socket.io")

const gameClockSpeed=60// hz

const networkUpdateSpeed=30// hz

const playerSpeedNormal=300// px/s

const speedLeeway=60//global snap distance px


/* 
TODO for player movement
client authoritative, trust but verify
client reports position and inputs,
client reports own collision and hits.

server checks the position
    is player faster than they should?
    is player in a wall?
    is player colliding with bullet?

    if player does not report their position in time, use extrapolation
    no server interpolation, let the clients do that themselves

    if player is out of bounds, move player to last verified position
        send new position to player and snap them to last verified position.
        player's next reported position must equal the force snap position

    individual bullets should be network synced for now, but only temporary since that is a lot of bandwidth.
        eventully it would be nice to only sync the pattern and a timescale, and have the client rebuild the pattern on their end

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

        this.pastPositions=[]//trying to calculate eve speed
        this.pastPositionTimestamps=[]
    }
}

class Bullet{
    constructor(x,y,xVelo,yVelo){
        this.x=x
        this.y=y
        this.xVelo=xVelo
        this.yVelo=yVelo

        //network syncing individual bullets is a bad idea. should only sync the spawn and velocity and have the client extrapolate.
        //client should report their own hits, but the server will check collisions as well to catch cheaters
            //clients may be able to lag switch their way through bullets. have to think about this...
    }
}

//keep track of players
var playerLookup=[]
//socket setup
var io = socket(server)

var clientId=0

//not perfect, but it will work for now
function getAveragePlayerSpeed(p){

    samples=10


    p.pastPositions.push({
        x:p.reportedPosition.x,
        y:p.reportedPosition.y
    })
    p.pastPositionTimestamps.push(p.lastUpdateTimestamp)
    if(p.pastPositions.length>samples){
        if(p.pastPositions.length!=p.pastPositionTimestamps.length){
            console.log("error positions and timestamps diffrent lengths")
        }
        p.pastPositions.splice(0,1)
        p.pastPositionTimestamps.splice(0,1)


        totalDistTraveled=0
        for(i=0;i<samples-1;i++){
            dx=p.pastPositions[i+1].x-p.pastPositions[i].x //deltaX
            dy=p.pastPositions[i+1].y-p.pastPositions[i].y //deltaY

            totalDistTraveled+=Math.sqrt( (dx*dx) + (dy*dy) ) //pythagorean
        }


        totalDeltaTime=p.pastPositionTimestamps[p.pastPositionTimestamps.length-1]-p.pastPositionTimestamps[0] //deltaTime

        

        aveSpeed=totalDistTraveled/totalDeltaTime*1000

        //console.log(aveSpeed)

        return aveSpeed

    }
    else{
        return playerSpeedNormal
    }
}


function movePlayers(deltaTime){
    

    playerLookup.forEach(function(p){
        p.timeSinceLastServerPositionUpdate+=deltaTime
        if(p.isActive){
            //console.log(p.reportedPosition.x+" "+p.serverPosition.x)

            //p.serverPosition=p.reportedPosition//FULL client authoraty

            if(p.sentUpdateSinceLastFrame){

                //check for speedhacks and lag
                aveSpeed=getAveragePlayerSpeed(p)

                if(aveSpeed>playerSpeedNormal+speedLeeway)
                {
                    console.log("player is too fast, server should pin them in place this frame")
                    //send message to player to stop them client side
                    p.socket.emit("forceSnapPosition",{
                        x: p.serverPosition.x,
                        y: p.serverPosition.y
                    });
                    
                }
                else{
                    //TODO: check for collisions
                    p.serverPosition.x=p.reportedPosition.x
                    p.serverPosition.y=p.reportedPosition.y
                }
                p.timeSinceLastServerPositionUpdate=0
            }
            else{
                
                //extrapolate then validate position
                exterpolate(p,deltaTime)
            }

            //disconnects inactive sockets
            p.sentUpdateSinceLastFrame=false//reset for next frame
            if(new Date().getTime() - p.lastUpdateTimestamp > 3000){
                p.isActive=false
                console.log(p.socket.id+" was kicked")
                p.socket.emit("IdleDisconnect")
                io.sockets.emit("serverPlayerDisconnect",p.socket.id)
            }
        }
    });
}


//main game loop

var timeSinceLastNetworkUpdate=0
function update(deltaTime){

    movePlayers(deltaTime)
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
    p.serverPosition.x+=deltaX*.5
    p.serverPosition.y+=deltaY*.5
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
    return addresses[0]
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
