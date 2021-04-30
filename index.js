var express = require("express")
var socket = require("socket.io")
var fs = require('fs');

const gameClockSpeed=60// hz

const networkUpdateSpeed=30// hz

const playerSpeedNormal=300// px/s

const speedLeeway=50//global snap distance px


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


//load lvls
var LVL = {
    "spawnPos":{"x":0,"y":0},
    "lvlName":"",
    "bgBuffer":""
    
}
function loadLvl(jsonPath){
    newLevel=JSON.parse(fs.readFileSync(jsonPath))
    LVL.spawnPos=newLevel.spawnPos
    LVL.lvlName=newLevel.lvlName

    //https://stackoverflow.com/questions/26331787/socket-io-node-js-simple-example-to-send-image-files-from-server-to-client
    fs.readFile(newLevel.bgPath, function(err, buf){
        LVL.bgBuffer=buf
    })
}


//load testLvl
loadLvl("testLvl.json")


class Player{
    constructor(socket){
        this.socket=socket
        this.isActive=true

        this.lastUpdateTimestamp=new Date().getTime()

        this.serverPosition=LVL.spawnPos

        this.reportedPosition={
            x:this.serverPosition.x,
            y:this.serverPosition.y
        }
        this.inputs={
            up: false,
            down: false,
            left: false,
            right: false,
        }
        this.sentUpdateSinceLastFrame=false

        //used to calculate ave speed
        this.pastPositions=[]
        this.pastPositionTimestamps=[]

        //used to correct speadhacking
        this.isPinned=false
        this.pinnedPosition=null
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

            if(p.sentUpdateSinceLastFrame){

                if(p.isPinned){
                    if(p.reportedPosition=p.pinnedPosition){
                        //user complied. unpin them
                        p.isPinned=false
                        p.pinnedPosition=[]
                    }
                    else{
                        //user did not comply. pin them again
                        p.socket.emit("forceSnapPosition",{
                            x: p.pinnedPosition,
                            y: p.pinnedPosition
                        });
                    }
                }

                else{
                    //TODO: check for collisions
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
                         p.pinnedPosition=p.serverPosition
                         p.isPinned=true
 
                     }
                     else{
                         //TODO: check for collisions
 
                         //if position is valid, update server position to match
                         p.serverPosition.x=p.reportedPosition.x
                         p.serverPosition.y=p.reportedPosition.y
                     }

                }
                p.timeSinceLastServerPositionUpdate=0
            }
            else{
                //extrapolate then validate position
                if(p.isPinned){
                    //probably not nessisary since player should not be able to move while pinned.
                    p.serverPosition=p.pinnedPosition
                }
                else{
                    exterpolate(p,deltaTime)
                    //TODO: check for collision after extrapolation
                }
            }

            //disconnects inactive sockets
            p.sentUpdateSinceLastFrame=false//reset for next frame
            if(new Date().getTime() - p.lastUpdateTimestamp > 3000){
                p.isActive=false
                console.log(p.socket.id+" was kicked for being idol")
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

function exterpolate(p,deltaTime){ //need to normalize. players can travel at sqrt(2)*maxSpeed if on a diagonal
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
    playerLookup[socket.id].socket.emit("serverTp",playerLookup[socket.id].serverPosition)
    playerLookup[socket.id].socket.emit("serverPrivate","connected on socket: "+socket.id)
    console.log("client connected on socket: ",socket.id +" Current active sockets: "+getTotalActiveSockets())

    //load assets
    //https://stackoverflow.com/questions/26331787/socket-io-node-js-simple-example-to-send-image-files-from-server-to-client
    socket.emit('imageLoad', { name:"bg", buffer: LVL.bgBuffer.toString('base64') }); 

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

        //set active
        if(!playerLookup[socket.id].isActive){
            playerLookup[socket.id].isActive=true
            console.log(socket.id, " has reconnected")
        }

    })

    socket.on('disconnect', function(){
        console.info('user disconnected from socket: ' + socket.id+" Current active sockets: "+getTotalActiveSockets());
        playerLookup[socket.id].isActive=false
        io.sockets.emit("serverMessage","user disconnected on socket: "+socket.id+". Current active sockets: "+getTotalActiveSockets())
        io.sockets.emit("serverPlayerDisconnect",socket.id)
    });

    
});

//https://stackoverflow.com/questions/10750303/how-can-i-get-the-local-ip-address-in-node-js
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

