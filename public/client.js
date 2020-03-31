//Make connection
var socket = io.connect(window.location.href);//change to server's location

//TODO: var for overall size of the game

var uploadrate=.3//slow for testing

var playerSpeedNormal=300

var gridUnitSize=50


//get html assets
var canvas = document.getElementById('canvas'),
    context = canvas.getContext('2d')


//define objects


class OtherPlayer{
    constructor(x,y,id){
        this.x=x
        this.y=y
        this.id=id
    }
}

class Me{
    constructor(){
        this.x=100
        this.y=100
        this.isConnected=false
        this.visibleWalls=[]
        this.visiblePlayers=[]
        this.keybindings={
            up: 87,
            down: 83,
            left: 65,
            right: 68
        }
    }
}
var me=new Me()


//handle inputs-----------------------------
var keys = [];
window.onkeyup = function(e) { keys[e.keyCode] = false; }
window.onkeydown = function(e) { keys[e.keyCode] = true;} 
keys[87]=keys[83]=keys[68]=keys[65]=keys[76]=keys[75]=false

//canvas setup----------------------------
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

//graphics--------------
function drawBackground(){
    context.fillStyle = "black"
    context.fillRect(0, 0, canvas.width, canvas.height); 
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

        canvas.width=canvas.width//refresh canvas
        drawBackground()

        //no need to slow down unconnected clients
        if(me.isConnected){
            uploadtimer+=deltatime
            if(uploadtimer>uploadrate){
                updatePlayer()                
            }

            //move player locally
            moveMe(deltatime)


            //render self
            //TODO: translate absolute coords to relative(to screen size)
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

                context.beginPath();
                context.fillStyle = 'red'
                context.strokeStyle="red"
                context.moveTo((vp.x)+10,(-vp.y))
                context.arc((vp.x), (-vp.y), 10, 0, 2 * Math.PI);
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

            
            
        }

        //pseudoServer stuff
        else if(false){
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


function moveMe(deltaTime){
    //TODO: use absolute coords
    var deltaY = (
        keys[me.keybindings.down]*playerSpeedNormal*deltaTime
        - keys[me.keybindings.up]*playerSpeedNormal*deltaTime
    )
    var deltaX=(
        keys[me.keybindings.right]*playerSpeedNormal*deltaTime
        - keys[me.keybindings.left]*playerSpeedNormal*deltaTime
    )
    //TODO: collision
    //TODO: stop from going off screen
    //TODO: scale speed to screen size
    me.x+=deltaX
    me.y+=deltaY
}


//networking out---------------------------

//emmit events

function updatePlayer(){
    p=me
    socket.emit("playerData",{
        //translate to absolute coordinates
        x: p.x,
        y: p.y,
        up: keys[me.keybindings.up],
        down: keys[me.keybindings.down],
        left: keys[me.keybindings.left],
        right: keys[me.keybindings.right],
    });
}


//networking in---------------------------

socket.on("serverPrivate",function(data){//server connection
    console.log("serverPrivate "+data)
    me.isConnected=true
});

me.visiblePlayers.push(new OtherPlayer(0,0,1))

socket.on("testPositionUpdator",function(data){//server connection
    me.visiblePlayers[0].x=data.x
    me.visiblePlayers[0].y=data.y
});


socket.on("serverMessage",function(data){
    serverInfo.innerHTML="[server]: "+data
    console.log(serverInfo.innerHTML="[server]: "+data)
})
