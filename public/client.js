//Make connection
var socket = io.connect(window.location.href);//change to server's location

//TODO: var for overall size of the game

var uploadrate=.3//slow for testing
var playerViewDist=400 //100
var playerWallViewDist=200
var playerViewAngle=0.785398//45 degrees in radians
var playerSpeedNormal=100
var playerTurnSpeed=1

var gridUnitSize=70


//get html assets
var canvas = document.getElementById('canvas'),
    context = canvas.getContext('2d'),
    serverInfo = document.getElementById("serverinfo"),
    pseudoServerInfo = document.getElementById("pseudoServerInfo"),
    startServerButton = document.getElementById("startServerButton"),
    joinCodeInput = document.getElementById("joinCodeInput"),
    joinServerButton = document.getElementById("joinServerButton");



var mySocketId = -1         //default as -1 
var myJoinCode              //for players connecting to psudoServer
var isPseudoServer = false  //server just relays data, PseudoServer manages the game 

//hide scrollbar
//document.body.style.overflow = 'hidden';


//define objects

//only used by host
class Host{
    constructor(id,joinCode){
        this.id=id
        this.joinCode=joinCode
        this.players=[]
        this.walls=[]//will be 2d
    }
}

class Player{
    constructor(x,y,id,isConnected,angle){
        this.x=x
        this.y=y
        this.angle=angle
        this.id=id
        this.isActive=true
        this.isConnected=isConnected
        this.joinCode=-1
        this.inputs={
            walkForward: false,
            walkBackward: false,
            walkRight: false,
            walkLeft: false,
            turnRight: false,
            turnLeft: false
        }
        this.visibleWalls=[]
        this.visiblePlayers=[]
        this.canSeeOtherPlayer=false
    }
}
var me=new Player(-1,-1,-1,false,0)//overwritten when connected to server

class Wall{
    constructor(x1,y1,height,width){
        this.x1=x1
        this.y1=y1
        this.height=height
        this.width=width

        //used for more math
        this.x2=x1+width
        this.y2=y1+height
        this.centerX=x1+(width/2)
        this.centerY=y1+(height/2)
    }
}

//handle inputs-----------------------------
var keys = [];
window.onkeyup = function(e) { keys[e.keyCode] = false; }
window.onkeydown = function(e) { keys[e.keyCode] = true; } 
keys[87]=keys[83]=keys[68]=keys[65]=keys[76]=keys[75]=false

//canvas setup----------------------------
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

//graphics--------------
function drawBackground(){
    context.fillStyle = "black"
    if(isPseudoServer)
        context.fillStyle = "rgb(19, 19, 32)"
    context.fillRect(0, 0, canvas.width, canvas.height)
}

//generate map (host)
var mapIsGenerated=false
function generateMap(){
    
    var u=gridUnitSize
    var xLen = Math.floor(canvas.width/gridUnitSize)
    var yLen = Math.floor(canvas.height/gridUnitSize)

    var map=[]
    for(var r=0;r<yLen;r++){
        var row=[]
        for(var c=0;c<xLen;c++){
            if(r>0 && r<yLen-2 && c>0 && c<xLen-1){//don't care about edges
                if(map[r-1][c-1]===null && map[r-1][c+1]===null){//NO CORNER TOUCHING
                    if(Math.floor(Math.random() * 2) == 0){//flip a coin
                        row.push(new Wall(c*u,r*u,u,u))
                    }
                    else{
                        row.push(null)
                    }
                }
                else{
                    row.push(null)
                }
            }
            else if (r==yLen-2){//second to last row
                if(c==0 || c==xLen-1){
                    row.push(new Wall(c*u,r*u,u,u))
                }
                row.push(null)
            }
            else{//bottom, top, and side walls
                row.push(new Wall(c*u,r*u,u,u))
            }
        }
        map.push(row)
    }
    return map
}


//https://gamedev.stackexchange.com/questions/114898/frustum-culling-how-to-calculate-if-an-angle-is-between-another-two-angles
function deltaAngle(px,py,pa,objx,objy){
    var l1x=objx-px
    var l1y=objy-py
    var l1mag=Math.sqrt((l1x*l1x) + (l1y*l1y))
    var l2x=Math.cos(pa)
    var l2y=Math.sin(pa)
    var dot=(l1x*l2x) + (l1y*l2y)
    var deltaAngle=Math.acos(dot/l1mag)
    return deltaAngle
}


//game logic------------------------------------


//update loop------------------------------------
var uploadtimer=0
window.onload = function(){
    
    function update(deltatime){
        /*
        37 left
        39 right
        87 w
        65 a
        83 s
        68 d
        75 k
        76 l
        81 q
        69 e
        */
        canvas.width=canvas.width//refresh canvas
        drawBackground()

        if(!isPseudoServer && me.isConnected){
            uploadtimer+=deltatime
            if(uploadtimer>uploadrate){
                // send inputs to pseudoServer
                sendInputsToHost(keys[87],keys[83],keys[68],keys[65],keys[76],keys[75])
            }

            var mul=1
            
            //render light
            context.beginPath();
            context.fillStyle = 'white'
            context.strokeStyle="white"
            context.moveTo(me.x+0,me.y)
            context.arc(me.x, me.y, playerViewDist*mul , me.angle-(playerViewAngle/2), me.angle+(playerViewAngle/2));
            context.fill();
            context.stroke();

            //render self
            context.fillStyle = 'blue'
            context.strokeStyle="blue"
            context.beginPath();
            context.moveTo(me.x+10,me.y)
            context.arc(me.x, me.y, 10, 0, 2 * Math.PI);
            context.closePath();
            context.fill();
            context.stroke();
            

            //render others
            me.visiblePlayers.forEach(function(vp){

                //FIXME: multiple players appear red

                //fov
                context.beginPath();
                context.strokeStyle="white"
                context.fillStyle = '#edb7ea'
                context.moveTo((vp.x*mul)+me.x,(-vp.y*mul)+me.y)
                context.arc((vp.x*mul)+me.x, (-vp.y*mul)+me.y, playerViewDist*mul , vp.angle-(playerViewAngle/2), vp.angle+(playerViewAngle/2));
                context.fill();
                context.stroke();
                //player
                context.beginPath();
                context.fillStyle = 'red'
                context.strokeStyle="red"
                context.moveTo((vp.x*mul)+10+me.x,(-vp.y*mul)+me.y)
                context.arc((vp.x*mul)+me.x, (-vp.y*mul)+me.y, 10, 0, 2 * Math.PI);
                context.closePath();
                context.fill();
                context.stroke();
            })
            context.stroke();

            //render visible walls
            me.visibleWalls.forEach(function(w){
                context.fillStyle = 'grey'
                context.strokeStyle="grey"
                context.fillRect((w.x1*mul)+me.x,(-w.y1*mul)+me.y,w.height*mul,w.width*mul)
                context.fill();
                context.stroke();
            })
            context.fillStyle = 'blue'
            context.strokeStyle="blue"

            //cover out of bounds object edges
            /*

            FIXME: works, but cuts off other players' fov

            context.beginPath()
            context.strokeStyle="black"
            context.lineWidth=playerViewDist 
            context.arc(me.x, me.y, (playerWallViewDist-(gridUnitSize/2)+(playerViewDist/2))*mul , me.angle+(playerViewAngle/2), me.angle-(playerViewAngle/2));
            context.stroke()
            context.lineWidth=gridUnitSize/2
            */
            
        }

        //pseudoServer stuff
        else if(isPseudoServer){
            if(me.players.length>0){
                me.players.forEach(function(p){

                    //player movement
                    //y is inverted
                    var deltaY = (
                        p.inputs.walkBackward*playerSpeedNormal*deltatime*(p.canSeeOtherPlayer+1) 
                        - p.inputs.walkForward*playerSpeedNormal*deltatime*(p.canSeeOtherPlayer+1)
                    )
                    var deltaX=(
                        p.inputs.walkRight*playerSpeedNormal*deltatime*(p.canSeeOtherPlayer+1)
                        -p.inputs.walkLeft*playerSpeedNormal*deltatime*(p.canSeeOtherPlayer+1)
                    )

                    
                    

                    //angle stuff
                    p.angle+=p.inputs.turnRight*playerTurnSpeed*deltatime*(p.canSeeOtherPlayer+1)
                    p.angle-=p.inputs.turnLeft*playerTurnSpeed*deltatime*(p.canSeeOtherPlayer+1)
                    if(p.angle>(2*Math.PI)){
                        p.angle=0
                    }
                    else if(p.angle<0){
                        p.angle=2*Math.PI
                    }

                    //calculate what player can see
                    p.canSeeOtherPlayer=false
                    var tempVpsx=[]
                    var tempVpsy=[]
                    var tempVpsa=[]
                    var tempWallsX=[]
                    var tempWallsY=[]
                    me.players.forEach(function(vp){//calculate visible players-------------------
                        if(vp!=p){//oviously you can see yourself

                            //if in view range
                            if(((vp.x-p.x)*(vp.x-p.x))+((vp.y-p.y)*(vp.y-p.y))<playerViewDist*playerViewDist){//if inside circle

                                if (Math.abs(deltaAngle(p.x,p.y,p.angle,vp.x,vp.y))<=playerViewAngle/2){//if in viewing angle

                                    //TODO: factor in walls in the way

                                    //relative coordinates
                                    tempVpsx.push(vp.x-p.x)
                                    tempVpsy.push(p.y-vp.y)
                                    tempVpsa.push(vp.angle)
                                    p.canSeeOtherPlayer=true
                                }

                                /*
                                FIXME: 
                                right now, objects are only rendered if their center is in the fov.
                                this causes objects to seem to teleport into view
                                this may be solved by increasing the fov a bit, bit i'd rather not hardcode
                                */
                                
                            }
                        }
                    })

                    //calculate visible walls
                    me.walls.forEach(function(r){
                        r.forEach(function(w){
                            if(w!=null){
                                if(((w.centerX-p.x)*(w.centerX-p.x))+((w.centerY-p.y)*(w.centerY-p.y))<playerViewDist*playerViewDist){
                                    if (Math.abs(deltaAngle(p.x,p.y,p.angle,w.centerX,w.centerY))<=playerViewAngle){
                                        tempWallsX.push(w.x1-p.x)
                                        tempWallsY.push(p.y-w.y1)
                                    }
                                    else if(((w.centerX-p.x)*(w.centerX-p.x))+((w.centerY-p.y)*(w.centerY-p.y))<playerWallViewDist*playerWallViewDist){
                                        tempWallsX.push(w.x1-p.x)
                                        tempWallsY.push(p.y-w.y1)
                                    }

                                    //x collision
                                    if(p.x+deltaX<w.x2 && p.x+deltaX>w.x1){
                                        //console.log("collision on x")
                                        if(p.y<w.y2 && p.y>w.y1){  
                                            deltaX=0
                                        }
                                    }
                                    //y collision
                                    if(p.x<w.x2 && p.x>w.x1){
                                        //console.log("collision on x")
                                        if(p.y+deltaY<w.y2 && p.y+deltaY>w.y1){  
                                            deltaY=0
                                        }
                                    }
                                    
                                }
                            }
                        })
                    })

                    p.y+=deltaY
                    p.x+=deltaX


                    //debugging server graphics-----------------
                    context.beginPath();
                    context.strokeStyle = 'blue';
                    context.fillStyle = 'blue';
                    context.moveTo(p.x+10,p.y)
                    context.arc(p.x, p.y, 10, 0, 2 * Math.PI);// x,y, r, start angle, end angle
                    context.fill();
                    context.stroke();

                    //debugging fov
                    context.beginPath();
                    context.strokeStyle = 'red';
                    context.arc(p.x, p.y, playerViewDist, 0, 2 * Math.PI);
                    context.stroke();

                    //debugging light
                    context.beginPath();
                    context.strokeStyle = 'white';
                    context.arc(p.x, p.y, playerViewDist , p.angle-(playerViewAngle/2), p.angle+(playerViewAngle/2));
                    context.stroke();


                    //enviroment
                    context.strokeStyle = 'white';
                    context.fillStyle = 'white';
                    me.walls.forEach(function(r){
                        r.forEach(function(w){
                            if(w!=null){
                                context.beginPath();
                                context.fillRect(w.x1,w.y1,w.width,w.height)
                                context.stroke();
                            }
                            
                            //console.log(w)
                        })
                    })
                    //console.log(me.walls)
                    /*

                    */
                    
                    //TODO: calculate what the player can see

                    //send data to player
                    socket.emit("hostToSingleClient",{
                        targetId: p.id,
                        angle: p.angle,
                        visiblePlayersX: tempVpsx,
                        visiblePlayersY: tempVpsy,
                        visiblePlayersA: tempVpsa,
                        visibleWallsX: tempWallsX,
                        visibleWallsY: tempWallsY
                    })
                })
            }
        }

        context.stroke();
 
    }

    //tick----------------
    
    //https://stackoverflow.com/questions/13996267/loop-forever-and-provide-delta-time
    var lastTick = performance.now()
    function tick(nowish) {
        var delta = nowish - lastTick
        lastTick = nowish
        delta/=1000 //ms to s
        update(delta)
        window.requestAnimationFrame(tick)
    }
    window.requestAnimationFrame(tick)
}


//networking out---------------------------


//request to be host
startServerButton.addEventListener("click", function(){
    becomeHost()
}); 

joinServerButton.addEventListener("click",function(){
    joinHost(joinCodeInput.value)
    me=new Player(-1,-1,-1,false,0)
    me.joinCode=joinCodeInput.value
});

//emmit events
function updatePlayer(p){
    socket.emit("playerdata",{
        x: p.x,
        y: p.y
    });
}

function becomeHost(){
    socket.emit("BecomeHost","plz work");
    console.log("requested to be host")
}

function joinHost(joinCode){
    socket.emit("joinHost",joinCode)
    console.log("attempting to join "+joinCode)
}

function sendInputsToHost(walkForward,walkBackward,walkRight,walkLeft,turnRight,turnLeft){
    socket.emit("clientToHost",{
        joinCode: me.joinCode,
        walkForward: walkForward,
        walkBackward: walkBackward,
        walkRight: walkRight,
        walkLeft: walkLeft,
        turnRight: turnRight,
        turnLeft: turnLeft
    })
}

//networking in---------------------------

socket.on("serverPrivate",function(data){//server connection
    if(mySocketId==-1){
        mySocketId=data
        pseudoServerInfo.innerHTML="connected to server, but not host"
    }
});

socket.on("clientToHost",function(data){
    if(isPseudoServer){
        // record player's inputs
        //new player is added in serverToHost
        me.players[data.playerId].inputs={
            walkForward: data.walkForward,
            walkBackward: data.walkBackward,
            walkRight: data.walkRight,
            walkLeft: data.walkLeft,
            turnRight: data.turnRight,
            turnLeft: data.turnLeft
        }
    }

})

socket.on("ServerToHost",function(data){
    
    if(!isPseudoServer){//initilize server
        isPseudoServer=true
        console.log("server accepted request. now hosting with code "+data)
        me=new Host(mySocketId,data)
        pseudoServerInfo.innerHTML="PseudoServer is up on id: "+me.joinCode
        me.walls=generateMap()
    }
    else{//new player
        me.players[data]=(new Player(100,100,data,true,0))//TODO: random spawn location and angle
        socket.emit("hostToSingleClient",{
            targetId: data
        })
        console.log("new player on socket "+data)
    }
});


/*
socket.on("serverPlayerDisconnect",function(data){

    for( var i = 0; i < players.length; i++){ 
        if ( players[i].id == data) {
            players[i].isActive=false

            players.splice(i, 1);//save some memory
        }
     }
})

*/
socket.on("hostToSingleClient",function(data){// should probably authenticate since no data is sent
    pseudoServerInfo.innerHTML="connected to PseudoServer"
    if(!isPseudoServer){
        if(!me.isConnected){
            me.x=canvas.width/2
            me.y=canvas.height/2
            me.isConnected=true
            me.joinCode=joinCodeInput.value
            console.log(me)
        }
        else{
            me.visiblePlayers=[]
            me.visibleWalls=[]

            for(var i=0;i<data.visiblePlayersX.length;i++){
                //console.log(Math.atan2(data.visiblePlayersX[i],data.visiblePlayersY[i])*180/Math.PI)//0 degrees is north
                me.visiblePlayers.push(new Player(data.visiblePlayersX[i],data.visiblePlayersY[i],-1,true,data.visiblePlayersA[i]))//relative coords
            }
            for(var i=0;i<data.visibleWallsX.length;i++){
                me.visibleWalls.push(new Wall(data.visibleWallsX[i],data.visibleWallsY[i],gridUnitSize,gridUnitSize))
            }
            me.angle=data.angle
        }
    }
})

socket.on("serverMessage",function(data){
    serverInfo.innerHTML="[server]: "+data
    console.log(serverInfo.innerHTML="[server]: "+data)
})
